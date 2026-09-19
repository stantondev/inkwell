defmodule InkwellWeb.EntryImageController do
  use InkwellWeb, :controller

  alias Inkwell.{Journals, Storage}

  # Accepted upload formats. Files are stored exactly as sent (no re-encoding).
  @format_regex ~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s

  # Max ~5.6M chars of base64 per image, i.e. about 4 MB of actual file.
  @max_base64_bytes 5_600_000

  # POST /api/images — upload an image (authenticated)
  def create(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    with {:ok, content_type, file_bytes} <- parse_image(image_data),
         {:ok, used, limit} <- Storage.check(user, file_bytes),
         {:ok, image} <-
           Journals.create_entry_image(%{
             "data" => image_data,
             "content_type" => content_type,
             "byte_size" => file_bytes,
             "user_id" => user.id
           }) do
      Storage.after_upload(user, used, file_bytes, limit)

      conn
      |> put_status(:created)
      |> json(%{data: %{id: image.id, url: "/api/images/#{image.id}"}})
    else
      {:error, :storage_limit_exceeded} -> storage_exceeded(conn, user)
      {:error, %Ecto.Changeset{}} -> unprocessable(conn, "Could not save image")
      {:error, reason} when is_binary(reason) -> unprocessable(conn, reason)
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing image parameter"})
  end

  # POST /api/images/batch — upload multiple images at once (authenticated)
  # Free: max 6 images, Plus: max 20
  @free_batch_limit 6
  @plus_batch_limit 20

  def create_batch(conn, %{"images" => images}) when is_list(images) do
    user = conn.assigns.current_user
    is_plus = (user.subscription_tier || "free") == "plus"
    batch_limit = if is_plus, do: @plus_batch_limit, else: @free_batch_limit

    cond do
      length(images) == 0 ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "No images provided"})

      length(images) > batch_limit ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Too many images — max #{batch_limit} per batch", limit: batch_limit})

      true ->
        # Parse and validate all images first
        parsed =
          Enum.with_index(images)
          |> Enum.reduce_while([], fn {image_data, idx}, acc ->
            case parse_image(image_data) do
              {:ok, content_type, file_bytes} ->
                {:cont, [{image_data, content_type, file_bytes} | acc]}

              {:error, reason} ->
                {:halt, {:error, "Image #{idx + 1}: #{reason}"}}
            end
          end)

        case parsed do
          {:error, reason} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: reason})

          valid_images when is_list(valid_images) ->
            valid_images = Enum.reverse(valid_images)
            total_bytes = Enum.reduce(valid_images, 0, fn {_, _, size}, acc -> acc + size end)

            case Storage.check(user, total_bytes) do
              {:error, :storage_limit_exceeded} ->
                storage_exceeded(conn, user)

              {:ok, used, limit} ->
                # Insert all images atomically via Ecto.Multi
                multi =
                  valid_images
                  |> Enum.with_index()
                  |> Enum.reduce(Ecto.Multi.new(), fn {{data, content_type, byte_size}, idx},
                                                      multi ->
                    attrs = %{
                      "data" => data,
                      "content_type" => content_type,
                      "byte_size" => byte_size,
                      "user_id" => user.id
                    }

                    Ecto.Multi.insert(
                      multi,
                      {:image, idx},
                      Inkwell.Journals.EntryImage.changeset(%Inkwell.Journals.EntryImage{}, attrs)
                    )
                  end)

                case Inkwell.Repo.transaction(multi) do
                  {:ok, results} ->
                    Storage.after_upload(user, used, total_bytes, limit)

                    data =
                      results
                      |> Enum.sort_by(fn {{:image, idx}, _} -> idx end)
                      |> Enum.map(fn {{:image, _}, image} ->
                        %{id: image.id, url: "/api/images/#{image.id}"}
                      end)

                    conn |> put_status(:created) |> json(%{data: data})

                  {:error, _name, _changeset, _changes} ->
                    conn
                    |> put_status(:unprocessable_entity)
                    |> json(%{error: "Could not save images"})
                end
            end
        end
    end
  end

  def create_batch(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing images parameter"})
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
                ext = image.content_type |> String.replace("image/", "")

                conn
                |> put_resp_content_type(image.content_type)
                |> put_resp_header("cache-control", "public, max-age=31536000, immutable")
                |> put_resp_header("content-disposition", "inline; filename=\"image.#{ext}\"")
                |> put_resp_header("x-content-type-options", "nosniff")
                |> send_resp(200, binary)

              :error ->
                conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image data"})
            end

          _ ->
            conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image data"})
        end
    end
  end

  # GET /api/me/storage — how much image storage the user has and uses
  def storage(conn, _params) do
    json(conn, %{data: Storage.summary(conn.assigns.current_user)})
  end

  # Parses a data URI, checks the size cap, and confirms the file really is the
  # format it claims (magic bytes) so non-image content can't be disguised.
  # Returns the real file size in bytes, which is what storage quotas count.
  defp parse_image(image_data) do
    case Regex.run(@format_regex, image_data) do
      [_, type, base64] ->
        normalized = if type == "jpg", do: "jpeg", else: type

        cond do
          byte_size(base64) > @max_base64_bytes ->
            {:error, "Image too large — max 4MB"}

          true ->
            case Base.decode64(base64) do
              {:ok, binary} ->
                detected = detect_image_type(binary)

                if detected == normalized do
                  {:ok, "image/#{normalized}", byte_size(binary)}
                else
                  {:error,
                   "Image content does not match claimed format (expected #{type}, detected #{detected || "unknown"})"}
                end

              :error ->
                {:error, "Invalid base64 encoding"}
            end
        end

      _ ->
        {:error, "Invalid image format — must be a data:image/... URI (PNG, JPEG, GIF, or WebP)"}
    end
  end

  defp storage_exceeded(conn, user) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "storage_limit_exceeded", storage: Storage.summary(user)})
  end

  defp unprocessable(conn, message) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: message})
  end

  defp detect_image_type(<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, _::binary>>), do: "png"
  defp detect_image_type(<<0xFF, 0xD8, 0xFF, _::binary>>), do: "jpeg"
  defp detect_image_type(<<0x47, 0x49, 0x46, 0x38, _::binary>>), do: "gif"

  defp detect_image_type(<<0x52, 0x49, 0x46, 0x46, _::32, 0x57, 0x45, 0x42, 0x50, _::binary>>),
    do: "webp"

  defp detect_image_type(_), do: nil
end
