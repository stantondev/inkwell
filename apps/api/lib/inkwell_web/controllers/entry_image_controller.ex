defmodule InkwellWeb.EntryImageController do
  use InkwellWeb, :controller

  alias Inkwell.{Images, Journals, Storage}

  # Accepted formats (PNG, JPEG, GIF, WebP, AVIF) and the checks live in
  # Inkwell.Images. Files are stored byte-for-byte (no re-encoding).

  # POST /api/images — upload an image (authenticated)
  def create(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    with {:ok, parsed} <- parse_image(image_data),
         file_bytes = byte_size(parsed.binary),
         {:ok, used, limit} <- Storage.check(user, file_bytes),
         {:ok, image} <- save(user.id, parsed) do
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
              {:ok, parsed} ->
                {:cont, [parsed | acc]}

              {:error, reason} ->
                {:halt, {:error, "Image #{idx + 1}: #{reason}"}}
            end
          end)

        case parsed do
          {:error, reason} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: reason})

          valid_images when is_list(valid_images) ->
            valid_images = Enum.reverse(valid_images)
            total_bytes = Enum.reduce(valid_images, 0, fn p, acc -> acc + byte_size(p.binary) end)

            case Storage.check(user, total_bytes) do
              {:error, :storage_limit_exceeded} ->
                storage_exceeded(conn, user)

              {:ok, used, limit} ->
                # Files go to object storage first (when configured), then all
                # rows are inserted atomically; a failed insert removes them.
                prepared = Enum.map(valid_images, &Images.prepare(user.id, &1))

                multi =
                  prepared
                  |> Enum.with_index()
                  |> Enum.reduce(Ecto.Multi.new(), fn {attrs, idx}, multi ->
                    Ecto.Multi.insert(multi, {:image, idx}, Images.changeset(attrs))
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
                    Images.discard(prepared)

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
        # Old SVG icons (from an early import) come back too; serve/3's
        # sandboxing CSP keeps any script in them from running.
        case Images.fetch(image) do
          {:ok, content_type, binary} -> serve(conn, content_type, binary)
          {:error, :corrupt} -> corrupt(conn)
          {:error, _} -> conn |> put_status(:service_unavailable) |> json(%{error: "Image temporarily unavailable"})
        end
    end
  end

  defp serve(conn, content_type, binary) do
    ext = content_type |> String.replace("image/", "") |> String.replace("+xml", "")

    conn
    |> put_resp_content_type(content_type)
    |> put_resp_header("cache-control", "public, max-age=31536000, immutable")
    |> put_resp_header("content-disposition", "inline; filename=\"image.#{ext}\"")
    |> Images.secure_headers()
    |> send_resp(200, binary)
  end

  defp save(user_id, parsed) do
    attrs = Images.prepare(user_id, parsed)

    case Images.insert(attrs) do
      {:ok, image} ->
        {:ok, image}

      {:error, _} = error ->
        Images.discard(attrs)
        error
    end
  end

  defp corrupt(conn) do
    conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image data"})
  end

  # GET /api/me/storage — how much image storage the user has and uses
  def storage(conn, _params) do
    json(conn, %{data: Storage.summary(conn.assigns.current_user)})
  end

  # Checks the data URI and that the file really is the format it claims
  # (magic bytes), so non-image content can't be disguised.
  defp parse_image(image_data) do
    case Images.parse_data_uri(image_data) do
      {:ok, parsed} ->
        {:ok, parsed}

      {:error, :too_large} ->
        {:error, "Image too large — max 4MB"}

      {:error, :bad_base64} ->
        {:error, "Invalid base64 encoding"}

      {:error, {:mismatch, _, _} = reason} ->
        {:error, "Image " <> Images.describe(reason)}

      {:error, _} ->
        {:error, "Invalid image format — must be a data:image/... URI (PNG, JPEG, GIF, WebP or AVIF)"}
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
end
