defmodule InkwellWeb.EntryImageController do
  use InkwellWeb, :controller

  alias Inkwell.Journals

  # POST /api/images — upload an image (authenticated)
  def create(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s, image_data) do
      [_, type, base64] ->
        # Max ~4MB of base64 (~3MB actual image)
        if byte_size(base64) > 5_600_000 do
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Image too large — max 4MB"})
        else
          content_type = "image/#{if type == "jpg", do: "jpeg", else: type}"

          attrs = %{
            "data" => image_data,
            "content_type" => content_type,
            "byte_size" => byte_size(base64),
            "user_id" => user.id
          }

          case Journals.create_entry_image(attrs) do
            {:ok, image} ->
              conn
              |> put_status(:created)
              |> json(%{data: %{id: image.id, url: "/api/images/#{image.id}"}})

            {:error, _changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Could not save image"})
          end
        end

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid image format — must be a data:image/... URI"})
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing image parameter"})
  end

  # GET /api/images/:id — serve an image (public)
  def show(conn, %{"id" => id}) do
    case Journals.get_entry_image(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Image not found"})

      image ->
        # Extract raw base64 from data URI
        case Regex.run(~r/^data:image\/[^;]+;base64,(.+)$/s, image.data) do
          [_, base64] ->
            case Base.decode64(base64) do
              {:ok, binary} ->
                conn
                |> put_resp_content_type(image.content_type)
                |> put_resp_header("cache-control", "public, max-age=31536000, immutable")
                |> send_resp(200, binary)

              :error ->
                conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image data"})
            end

          _ ->
            conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image data"})
        end
    end
  end
end
