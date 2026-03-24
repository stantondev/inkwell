defmodule Inkwell.Import.ImageImporter do
  @moduledoc """
  Downloads and localizes external images found in imported entry HTML.
  Replaces external image URLs with local `/api/images/:id` URLs.

  Used by ImportDataWorker after parsing, before entry creation.
  Applies to ALL import formats (WordPress, Medium, Substack, CSV, JSON, etc.).

  Safeguards:
  - 5MB per-image size limit
  - 10-second timeout per download
  - 500ms delay between requests (rate limiting)
  - Content-type validation (only image/* MIME types)
  - Max 50 images per entry
  - Graceful degradation: failed downloads leave original URLs intact
  """

  require Logger

  alias Inkwell.Journals.EntryImage
  alias Inkwell.Repo

  @max_image_size 5 * 1024 * 1024  # 5MB
  @download_timeout 10_000          # 10 seconds
  @rate_limit_ms 500                # 500ms between requests
  @max_images_per_entry 20

  @doc """
  Process HTML body, downloading external images and replacing URLs with local ones.
  Returns updated HTML body. Failed downloads leave original URLs intact.
  """
  def localize_images(nil, _user_id), do: nil
  def localize_images("", _user_id), do: ""

  def localize_images(body_html, user_id) do
    # Find all <img> src URLs
    image_urls = extract_image_urls(body_html)
    external_urls = Enum.filter(image_urls, &external_url?/1) |> Enum.take(@max_images_per_entry)

    if external_urls == [] do
      body_html
    else
      # Download and store each image, building a URL replacement map
      url_map = download_images(external_urls, user_id)

      # Replace URLs in the HTML
      Enum.reduce(url_map, body_html, fn {original_url, local_url}, html ->
        String.replace(html, original_url, local_url)
      end)
    end
  end

  @doc """
  Extract all image URLs from HTML.
  """
  def extract_image_urls(html) do
    Regex.scan(~r/<img[^>]+src="([^"]+)"/i, html)
    |> Enum.map(fn [_, url] -> url end)
    |> Enum.uniq()
  end

  # ── Private ──

  defp external_url?(url) do
    # Local images (already imported) start with /api/images/
    # Data URIs start with data:
    # Only process http(s) URLs
    String.starts_with?(url, "http://") || String.starts_with?(url, "https://")
  end

  defp download_images(urls, user_id) do
    urls
    |> Enum.reduce(%{}, fn url, acc ->
      result =
        case download_and_store(url, user_id) do
          {:ok, local_url} ->
            Map.put(acc, url, local_url)

          {:error, reason} ->
            Logger.warning("[ImageImporter] Failed to download #{url}: #{reason}")
            acc
        end

      # Free image binary memory immediately instead of waiting for GC cycle.
      # Each image can be up to 5MB; without this, binaries linger on the heap
      # until the next GC and can cause OOM on large imports.
      :erlang.garbage_collect()

      # Rate limit: pause between downloads
      if length(urls) > 1, do: Process.sleep(@rate_limit_ms)

      result
    end)
  end

  defp download_and_store(url, user_id) do
    with {:ok, data, content_type} <- download_image(url),
         {:ok, image} <- store_image(data, content_type, url, user_id) do
      {:ok, "/api/images/#{image.id}"}
    end
  end

  defp download_image(url) do
    # Use :httpc for HTTP downloads
    url_charlist = to_charlist(url)

    http_options = [
      timeout: @download_timeout,
      connect_timeout: 5_000,
      autoredirect: true,
      relaxed: true
    ]

    request_headers = [
      {~c"user-agent", ~c"Inkwell/1.0 (import image fetcher)"},
      {~c"accept", ~c"image/*"}
    ]

    case :httpc.request(:get, {url_charlist, request_headers}, http_options, [body_format: :binary]) do
      {:ok, {{_, status, _}, headers, body}} when status in 200..299 ->
        content_type = extract_content_type(headers)

        cond do
          !image_content_type?(content_type) ->
            {:error, "not an image (#{content_type})"}

          byte_size(body) > @max_image_size ->
            {:error, "image too large (#{div(byte_size(body), 1024)}KB > 5MB)"}

          byte_size(body) == 0 ->
            {:error, "empty response"}

          true ->
            {:ok, body, content_type}
        end

      {:ok, {{_, status, _}, _, _}} ->
        {:error, "HTTP #{status}"}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  rescue
    e -> {:error, "download error: #{Exception.message(e)}"}
  end

  defp extract_content_type(headers) do
    Enum.find_value(headers, "application/octet-stream", fn
      {key, value} ->
        key_str = to_string(key) |> String.downcase()
        if key_str == "content-type" do
          to_string(value) |> String.split(";") |> hd() |> String.trim()
        end
    end)
  end

  defp image_content_type?(ct) do
    String.starts_with?(ct, "image/")
  end

  defp store_image(data, content_type, url, user_id) do
    filename = url |> URI.parse() |> Map.get(:path, "image") |> Path.basename()

    # Build a data URI for storage (matching existing EntryImage pattern)
    base64 = Base.encode64(data)
    data_uri = "data:#{content_type};base64,#{base64}"

    %EntryImage{}
    |> Ecto.Changeset.change(%{
      user_id: user_id,
      data: data_uri,
      content_type: content_type,
      filename: filename,
      byte_size: byte_size(data)
    })
    |> Repo.insert()
  end
end
