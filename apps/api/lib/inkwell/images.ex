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

  Object storage will plug in behind `store/3`.
  """

  import Plug.Conn, only: [put_resp_header: 3]

  alias Inkwell.Repo
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
  Attributes for an `entry_images` row from parsed image info (see
  `parse_data_uri/2`, `parse_binary/2`). `byte_size` is the real file size,
  which is what storage allowances count.
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
  Saves raw image bytes as an entry image. Refuses anything that isn't really
  a PNG, JPEG, GIF or WebP, or is over `:max_bytes`.
  """
  def store(user_id, binary, opts \\ []) when is_binary(binary) do
    with {:ok, parsed} <- parse_binary(binary, opts[:max_bytes] || @default_max_bytes) do
      insert(entry_image_attrs(user_id, parsed, opts))
    end
  end

  @doc "Inserts an `entry_images` row from `entry_image_attrs/3`."
  def insert(attrs), do: attrs |> changeset() |> Repo.insert()

  def changeset(attrs), do: EntryImage.changeset(%EntryImage{}, attrs)

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
