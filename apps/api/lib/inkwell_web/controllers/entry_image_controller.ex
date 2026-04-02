defmodule InkwellWeb.EntryImageController do
  use InkwellWeb, :controller

  alias Inkwell.Journals

  # Storage quota: free = 100 MB of base64, plus = 1 GB
  @free_storage_limit 104_857_600
  @plus_storage_limit 1_073_741_824

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
          limit = if (user.subscription_tier || "free") == "plus", do: @plus_storage_limit, else: @free_storage_limit
          current_usage = Journals.get_total_image_storage(user.id)

          if current_usage + byte_size(base64) > limit do
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "storage_limit_exceeded"})
          else
            content_type = "image/#{if type == "jpg", do: "jpeg", else: type}"

            # Validate magic bytes match claimed content type
            case validate_image_magic_bytes(base64, type) do
              {:error, reason} ->
                conn
                |> put_status(:unprocessable_entity)
                |> json(%{error: reason})

              :ok ->
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
            case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s, image_data) do
              [_, type, base64] ->
                if byte_size(base64) > 5_600_000 do
                  {:halt, {:error, "Image #{idx + 1} too large — max 4MB"}}
                else
                  case validate_image_magic_bytes(base64, type) do
                    :ok ->
                      content_type = "image/#{if type == "jpg", do: "jpeg", else: type}"
                      {:cont, [{image_data, content_type, byte_size(base64)} | acc]}

                    {:error, reason} ->
                      {:halt, {:error, "Image #{idx + 1}: #{reason}"}}
                  end
                end

              _ ->
                {:halt, {:error, "Image #{idx + 1}: invalid format — must be a data:image/... URI"}}
            end
          end)

        case parsed do
          {:error, reason} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: reason})

          valid_images when is_list(valid_images) ->
            valid_images = Enum.reverse(valid_images)
            total_bytes = Enum.reduce(valid_images, 0, fn {_, _, size}, acc -> acc + size end)

            limit = if is_plus, do: @plus_storage_limit, else: @free_storage_limit
            current_usage = Journals.get_total_image_storage(user.id)

            if current_usage + total_bytes > limit do
              conn |> put_status(:unprocessable_entity) |> json(%{error: "storage_limit_exceeded"})
            else
              # Insert all images atomically via Ecto.Multi
              multi =
                valid_images
                |> Enum.with_index()
                |> Enum.reduce(Ecto.Multi.new(), fn {{data, content_type, byte_size}, idx}, multi ->
                  attrs = %{
                    "data" => data,
                    "content_type" => content_type,
                    "byte_size" => byte_size,
                    "user_id" => user.id
                  }

                  Ecto.Multi.insert(multi, {:image, idx}, Inkwell.Journals.EntryImage.changeset(%Inkwell.Journals.EntryImage{}, attrs))
                end)

              case Inkwell.Repo.transaction(multi) do
                {:ok, results} ->
                  data =
                    results
                    |> Enum.sort_by(fn {{:image, idx}, _} -> idx end)
                    |> Enum.map(fn {{:image, _}, image} ->
                      %{id: image.id, url: "/api/images/#{image.id}"}
                    end)

                  conn |> put_status(:created) |> json(%{data: data})

                {:error, _name, _changeset, _changes} ->
                  conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not save images"})
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

  # Validates that decoded image binary matches the claimed content type via magic bytes.
  # Prevents uploading non-image content (e.g., HTML disguised as PNG).
  defp validate_image_magic_bytes(base64, claimed_type) do
    case Base.decode64(base64) do
      {:ok, binary} ->
        detected = detect_image_type(binary)

        normalized_claim = if claimed_type == "jpg", do: "jpeg", else: claimed_type

        if detected == normalized_claim do
          :ok
        else
          {:error, "Image content does not match claimed format (expected #{claimed_type}, detected #{detected || "unknown"})"}
        end

      :error ->
        {:error, "Invalid base64 encoding"}
    end
  end

  defp detect_image_type(<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, _::binary>>), do: "png"
  defp detect_image_type(<<0xFF, 0xD8, 0xFF, _::binary>>), do: "jpeg"
  defp detect_image_type(<<0x47, 0x49, 0x46, 0x38, _::binary>>), do: "gif"
  defp detect_image_type(<<0x52, 0x49, 0x46, 0x46, _::32, 0x57, 0x45, 0x42, 0x50, _::binary>>), do: "webp"
  defp detect_image_type(_), do: nil
end
