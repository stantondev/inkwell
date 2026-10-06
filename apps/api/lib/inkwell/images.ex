defmodule Inkwell.Images do
  @moduledoc """
  The one place uploaded images are checked and saved.

  Until 2026-10-06 each upload path had its own idea of what an image was.
  The editor upload checked the file's real format (magic bytes), but Post by
  Email and the importer accepted anything that called itself `image/*`,
  including SVG, and `PATCH /api/me` stored any string as an avatar, which
  `/api/avatars/:username` then served with whatever type the string claimed.
  Images are served from inkwell.social itself, so an SVG with a script in it
  would have run as inkwell.social when opened directly. Nothing like that was
  found in production (two harmless SVG icons from a LiveJournal import), but
  the door was open.

  Now everything goes through here: PNG, JPEG, GIF and WebP only, decided by
  the file's own bytes rather than what the sender says, and stored with the
  type we detected. Serving adds a sandboxing Content-Security-Policy as a
  second line of defence (see `secure_headers/1`).

  ## Where the files live

  With a bucket configured (Inkwell.ObjectStore; inkwell.social since
  2026-10-06) a new upload goes to the bucket under `images/<id>` and its row
  keeps only `storage_key`. If the bucket can't be reached the upload is kept
  in Postgres instead (`data`), so uploads never fail because of it, and
  `move_to_object_store/1` picks it up later. Without a bucket (local dev,
  self-hosted servers) everything stays in Postgres as before.

  Rows copied over from before keep their `data` until
  `drop_database_copies/1` clears it, so the copy can be checked first.
  Serving prefers the bucket and falls back to `data`. Deleting a row queues
  its object for deletion through a database trigger (see
  ObjectStoreDeletionWorker), whatever deleted the row.

  Image links never change: `/api/images/:id` either way, which matters
  because they're in post HTML and copied onto other fediverse servers.
  """

  import Ecto.Query
  import Plug.Conn, only: [put_resp_header: 3]

  require Logger

  alias Inkwell.{ObjectStore, Repo}
  alias Inkwell.Journals.EntryImage

  @types ~w(png jpeg gif webp)

  # Entry images: about 4 MB of actual file.
  @default_max_bytes 4_200_000

  @data_uri ~r/\Adata:image\/(png|jpeg|jpg|gif|webp);base64,(.+)\z/s

  @doc "Formats we accept, by the short name used in MIME types."
  def types, do: @types

  def default_max_bytes, do: @default_max_bytes

  @doc "The real format of a file from its first bytes, or nil."
  def detect_type(<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, _::binary>>), do: "png"
  def detect_type(<<0xFF, 0xD8, 0xFF, _::binary>>), do: "jpeg"
  def detect_type(<<"GIF8", _::binary>>), do: "gif"
  def detect_type(<<"RIFF", _::binary-size(4), "WEBP", _::binary>>), do: "webp"
  def detect_type(_), do: nil

  @doc "A data URI for bytes of a known type."
  def data_uri(type, binary) when type in @types,
    do: "data:image/#{type};base64," <> Base.encode64(binary)

  @doc """
  Checks a `data:image/...;base64,` value sent by a client.

  Returns `{:ok, %{type, content_type, binary, data_uri}}` with the data URI
  rebuilt from the detected type, or `{:error, reason}` where reason is
  `:invalid`, `:bad_base64`, `:too_large` or `{:mismatch, claimed, detected}`.
  """
  def parse_data_uri(value, max_bytes \\ @default_max_bytes)

  def parse_data_uri(value, max_bytes) when is_binary(value) do
    case Regex.run(@data_uri, value) do
      [_, claimed, base64] ->
        claimed = normalize(claimed)

        # Refuse oversized payloads before decoding them.
        if byte_size(base64) > div(max_bytes * 4, 3) + 8 do
          {:error, :too_large}
        else
          case Base.decode64(base64, ignore: :whitespace) do
            {:ok, binary} -> check(binary, claimed, max_bytes)
            :error -> {:error, :bad_base64}
          end
        end

      _ ->
        {:error, :invalid}
    end
  end

  def parse_data_uri(_, _), do: {:error, :invalid}

  defp check(binary, claimed, max_bytes) do
    detected = detect_type(binary)

    cond do
      byte_size(binary) > max_bytes -> {:error, :too_large}
      detected != claimed -> {:error, {:mismatch, claimed, detected}}
      true -> {:ok, info(detected, binary)}
    end
  end

  @doc """
  Checks raw bytes (a download, an email attachment). The sender's claimed
  type is ignored: the bytes decide.
  """
  def parse_binary(binary, max_bytes \\ @default_max_bytes) when is_binary(binary) do
    case detect_type(binary) do
      nil -> {:error, :unsupported}
      _ when byte_size(binary) > max_bytes -> {:error, :too_large}
      type -> {:ok, info(type, binary)}
    end
  end

  defp info(type, binary) do
    %{type: type, content_type: "image/#{type}", binary: binary, data_uri: data_uri(type, binary)}
  end

  @doc """
  Attributes for an `entry_images` row kept in Postgres, from parsed image
  info (see `parse_data_uri/2`, `parse_binary/2`). `byte_size` is the real
  file size, which is what storage allowances count.
  """
  def entry_image_attrs(user_id, %{content_type: ct, binary: binary, data_uri: uri}, opts \\ []) do
    %{
      "user_id" => user_id,
      "data" => uri,
      "content_type" => ct,
      "byte_size" => byte_size(binary),
      "filename" => opts[:filename] |> clean_filename()
    }
  end

  @doc """
  Like `entry_image_attrs/3`, but puts the file in object storage first when
  a bucket is configured: the attributes then carry the row's `"id"` and
  `"storage_key"` and no `"data"`. If the upload fails the file stays in
  Postgres (logged), so the caller can always insert what comes back. If the
  insert then fails, call `discard/1` with these attributes.
  """
  def prepare(user_id, %{binary: binary, content_type: ct} = parsed, opts \\ []) do
    attrs = entry_image_attrs(user_id, parsed, opts)

    if ObjectStore.configured?() do
      id = Ecto.UUID.generate()
      key = key_for(id)

      case ObjectStore.put(key, binary, ct) do
        :ok ->
          attrs |> Map.delete("data") |> Map.merge(%{"id" => id, "storage_key" => key})

        {:error, reason} ->
          Logger.warning("[Images] Object storage upload failed, keeping #{key} in Postgres: #{inspect(reason)}")
          attrs
      end
    else
      attrs
    end
  end

  @doc "Removes uploaded objects for attributes from `prepare/3` that never got a row."
  def discard(attrs_list) when is_list(attrs_list), do: Enum.each(attrs_list, &discard/1)
  def discard(%{"storage_key" => key}) when is_binary(key) do
    ObjectStore.delete(key)
    :ok
  end

  def discard(_), do: :ok

  @doc "The object storage key for an image id."
  def key_for(id), do: "images/" <> id

  @doc """
  Saves raw image bytes as an entry image. Refuses anything that isn't really
  a PNG, JPEG, GIF or WebP, or is over `:max_bytes`.
  """
  def store(user_id, binary, opts \\ []) when is_binary(binary) do
    with {:ok, parsed} <- parse_binary(binary, opts[:max_bytes] || @default_max_bytes) do
      attrs = prepare(user_id, parsed, opts)

      case insert(attrs) do
        {:ok, image} -> {:ok, image}
        {:error, _} = error ->
          discard(attrs)
          error
      end
    end
  end

  @doc "Inserts an `entry_images` row from `prepare/3` or `entry_image_attrs/3`."
  def insert(attrs), do: attrs |> changeset() |> Repo.insert()

  def changeset(attrs) do
    EntryImage.changeset(%EntryImage{id: attrs["id"]}, Map.delete(attrs, "id"))
  end

  @doc """
  An image's content type and bytes, from object storage or Postgres. Bucket
  first; if that fails and the row still has its Postgres copy, that's used.
  """
  def fetch(%EntryImage{storage_key: key} = image) when is_binary(key) do
    case ObjectStore.get(key) do
      {:ok, binary} ->
        {:ok, image.content_type, binary}

      {:error, reason} ->
        if image.data do
          Logger.warning("[Images] Object storage read failed for #{key}, using Postgres copy: #{inspect(reason)}")
          fetch_data(image)
        else
          Logger.error("[Images] Object storage read failed for #{key}: #{inspect(reason)}")
          {:error, reason}
        end
    end
  end

  def fetch(%EntryImage{} = image), do: fetch_data(image)

  # Accepted formats only, plus the two SVG icons from an early import, which
  # are served sandboxed (see EntryImageController).
  defp fetch_data(%EntryImage{data: data}) do
    case decode_stored(data) do
      {:ok, ct, binary} ->
        {:ok, ct, binary}

      :error ->
        case Regex.run(~r/\Adata:(image\/svg\+xml);base64,(.+)\z/s, data || "") do
          [_, ct, base64] ->
            case Base.decode64(base64, ignore: :whitespace) do
              {:ok, binary} -> {:ok, ct, binary}
              :error -> {:error, :corrupt}
            end

          _ ->
            {:error, :corrupt}
        end
    end
  end

  @doc """
  Copies images still kept only in Postgres to object storage, checking each
  copy reads back byte-for-byte before recording its key. The Postgres copy
  is kept (see `drop_database_copies/1`). Returns `%{moved, failed, remaining}`.
  """
  def move_to_object_store(limit \\ 25) do
    if ObjectStore.configured?() do
      ids =
        EntryImage
        |> where([i], is_nil(i.storage_key) and not is_nil(i.data))
        |> order_by([i], asc: i.inserted_at)
        |> limit(^limit)
        |> select([i], i.id)
        |> Repo.all()

      results = Enum.map(ids, &move_one/1)

      remaining =
        EntryImage
        |> where([i], is_nil(i.storage_key) and not is_nil(i.data))
        |> Repo.aggregate(:count)

      %{
        moved: Enum.count(results, &(&1 == :ok)),
        failed: Enum.count(results, &(&1 != :ok)),
        remaining: remaining
      }
    else
      {:error, :not_configured}
    end
  end

  defp move_one(id) do
    with %EntryImage{storage_key: nil} = image <- Repo.get(EntryImage, id),
         {:ok, ct, binary} <- fetch_data(image),
         key = key_for(image.id),
         :ok <- ObjectStore.put(key, binary, ct),
         {:ok, ^binary} <- ObjectStore.get(key),
         {1, _} <-
           EntryImage
           |> where([i], i.id == ^image.id and is_nil(i.storage_key))
           |> Repo.update_all(set: [storage_key: key, updated_at: DateTime.utc_now()]) do
      :ok
    else
      nil ->
        :ok

      %EntryImage{} ->
        :ok

      other ->
        Logger.error("[Images] Could not move image #{id} to object storage: #{inspect(other, limit: 5)}")
        :error
    end
  end

  @doc """
  Clears the Postgres copy of images that have been in object storage for at
  least `min_days`, after checking each object is still there. Run once the
  moved copies have been in use for a while. Returns `%{cleared, kept}`.
  Postgres only gives the space back after `VACUUM FULL entry_images`.
  """
  def drop_database_copies(min_days \\ 14) do
    cutoff = DateTime.add(DateTime.utc_now(), -min_days * 86_400, :second)

    rows =
      EntryImage
      |> where([i], not is_nil(i.storage_key) and not is_nil(i.data) and i.updated_at < ^cutoff)
      |> select([i], {i.id, i.storage_key, i.byte_size})
      |> Repo.all()

    Enum.reduce(rows, %{cleared: 0, kept: 0}, fn {id, key, size}, acc ->
      case ObjectStore.get(key) do
        {:ok, binary} when byte_size(binary) == size ->
          EntryImage |> where([i], i.id == ^id) |> Repo.update_all(set: [data: nil])
          %{acc | cleared: acc.cleared + 1}

        _ ->
          %{acc | kept: acc.kept + 1}
      end
    end)
  end

  @doc """
  Bytes and content type of a stored data URI, for serving. Only the formats
  we accept are returned; anything else is `:error`.
  """
  def decode_stored(value) when is_binary(value) do
    with [_, type, base64] <- Regex.run(@data_uri, value),
         {:ok, binary} <- Base.decode64(base64, ignore: :whitespace) do
      {:ok, "image/" <> normalize(type), binary}
    else
      _ -> :error
    end
  end

  def decode_stored(_), do: :error

  @doc """
  Headers every served image gets. `nosniff` stops a browser guessing a
  different type; the sandboxing CSP means that even if a file is opened
  directly as a page (an old SVG, say), no script in it can run.
  """
  def secure_headers(conn) do
    conn
    |> put_resp_header("x-content-type-options", "nosniff")
    |> put_resp_header("content-security-policy", csp())
  end

  def csp, do: "default-src 'none'; style-src 'unsafe-inline'; sandbox"

  @doc "A short, readable reason for logs and error messages."
  def describe(:invalid), do: "not a PNG, JPEG, GIF or WebP data URI"
  def describe(:unsupported), do: "not a PNG, JPEG, GIF or WebP image"
  def describe(:bad_base64), do: "invalid base64 encoding"
  def describe(:too_large), do: "too large"

  def describe({:mismatch, claimed, detected}),
    do: "content does not match claimed format (expected #{claimed}, detected #{detected || "unknown"})"

  def describe(%Ecto.Changeset{}), do: "could not be saved"
  def describe(other), do: inspect(other)

  defp normalize("jpg"), do: "jpeg"
  defp normalize(type), do: type

  defp clean_filename(nil), do: nil

  defp clean_filename(name) when is_binary(name) do
    name |> String.replace(~r/[\x00-\x1f]/, "") |> String.slice(0, 200)
  end

  defp clean_filename(_), do: nil
end
