defmodule Inkwell.Federation.MastodonClient do
  @moduledoc """
  HTTP client for the Mastodon API — posting statuses and uploading media.
  Used by CrosspostWorker to cross-post Inkwell entries to linked Mastodon accounts.
  """

  require Logger

  @max_status_length 500
  @max_hashtags 5

  # ── Post Status ──────────────────────────────────────────────────

  @doc """
  Post a status to a Mastodon-compatible instance.

  Returns `{:ok, %{id: status_id, url: status_url}}` or `{:error, reason}`.
  """
  def post_status(domain, access_token, params) do
    url = "https://#{domain}/api/v1/statuses"

    body = Jason.encode!(params)

    headers = [
      {~c"authorization", String.to_charlist("Bearer #{access_token}")},
      {~c"content-type", ~c"application/json"},
      {~c"user-agent", ~c"Inkwell/0.1"}
    ]

    case http_post(url, headers, body) do
      {:ok, {status, resp_body}} when status in 200..299 ->
        case Jason.decode(resp_body) do
          {:ok, %{"id" => id, "url" => status_url}} ->
            {:ok, %{id: id, url: status_url}}

          {:ok, %{"id" => id}} ->
            {:ok, %{id: id, url: "https://#{domain}/@unknown/#{id}"}}

          {:ok, _data} ->
            {:error, :unexpected_response}

          {:error, _} ->
            {:error, :json_decode_error}
        end

      {:ok, {status, resp_body}} ->
        Logger.warning("Mastodon post_status failed: #{status} — #{String.slice(resp_body, 0..200)}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Mastodon post_status network error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ── Upload Media ──────────────────────────────────────────────────

  @doc """
  Upload media to a Mastodon-compatible instance.

  Returns `{:ok, media_id}` or `{:error, reason}`.
  """
  def upload_media(domain, access_token, image_binary, content_type) do
    url = "https://#{domain}/api/v2/media"

    boundary = "inkwell-#{:crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)}"

    body =
      "--#{boundary}\r\n" <>
        "Content-Disposition: form-data; name=\"file\"; filename=\"cover.#{ext_from_content_type(content_type)}\"\r\n" <>
        "Content-Type: #{content_type}\r\n" <>
        "\r\n" <>
        image_binary <>
        "\r\n" <>
        "--#{boundary}--\r\n"

    headers = [
      {~c"authorization", String.to_charlist("Bearer #{access_token}")},
      {~c"user-agent", ~c"Inkwell/0.1"}
    ]

    content_type_header = String.to_charlist("multipart/form-data; boundary=#{boundary}")

    case http_post_raw(url, headers, content_type_header, body) do
      {:ok, {status, resp_body}} when status in [200, 202] ->
        case Jason.decode(resp_body) do
          {:ok, %{"id" => media_id}} -> {:ok, media_id}
          _ -> {:error, :unexpected_response}
        end

      {:ok, {status, resp_body}} ->
        Logger.warning("Mastodon upload_media failed: #{status} — #{String.slice(resp_body, 0..200)}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Mastodon upload_media network error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ── Delete Status ──────────────────────────────────────────────────

  @doc """
  Delete a status from a Mastodon-compatible instance.
  """
  def delete_status(domain, access_token, status_id) do
    url = "https://#{domain}/api/v1/statuses/#{status_id}"

    headers = [
      {~c"authorization", String.to_charlist("Bearer #{access_token}")},
      {~c"user-agent", ~c"Inkwell/0.1"}
    ]

    case http_delete(url, headers) do
      {:ok, {status, _}} when status in 200..299 -> :ok
      {:ok, {status, _}} -> {:error, {:http_error, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  # ── Build Crosspost Text ──────────────────────────────────────────

  @doc """
  Build the status text for cross-posting an Inkwell entry to Mastodon.

  Format:
    Title

    Excerpt...

    https://inkwell.social/username/slug

    #tag1 #tag2

  Total must fit in 500 chars (Mastodon default limit).
  """
  def build_crosspost_text(entry, username) do
    url = "https://inkwell.social/#{username}/#{entry.slug}"
    # URL always counts as 23 chars in Mastodon (link shortening)
    url_chars = 23

    # Build hashtags from entry tags (up to 5)
    hashtags =
      (entry.tags || [])
      |> Enum.take(@max_hashtags)
      |> Enum.map(fn tag ->
        "#" <> String.replace(tag, ~r/[^a-zA-Z0-9_]/, "")
      end)
      |> Enum.reject(fn h -> h == "#" end)

    hashtag_text = Enum.join(hashtags, " ")

    # Calculate available space for title + excerpt
    # Format: "title\n\nexcerpt\n\nurl\n\n#tags"
    separator_chars = if hashtag_text != "", do: 6, else: 2  # newlines between sections
    hashtag_chars = if hashtag_text != "", do: String.length(hashtag_text), else: 0
    available = @max_status_length - url_chars - separator_chars - hashtag_chars

    title = entry.title || ""
    excerpt = entry.excerpt || auto_excerpt(entry.body_html)

    {title_text, excerpt_text} =
      cond do
        title == "" && excerpt == "" ->
          {"", ""}

        title == "" ->
          {"", String.slice(excerpt, 0, available)}

        String.length(title) >= available ->
          {String.slice(title, 0, available - 1) <> "\u2026", ""}

        true ->
          title_len = String.length(title)
          # 2 chars for \n\n between title and excerpt
          excerpt_budget = available - title_len - 2

          if excerpt_budget > 30 && excerpt != "" do
            ex = String.slice(excerpt, 0, excerpt_budget - 1) <> "\u2026"
            {title, ex}
          else
            {title, ""}
          end
      end

    # Assemble
    parts = [title_text, excerpt_text, url, hashtag_text]
    |> Enum.reject(&(&1 == ""))
    |> Enum.join("\n\n")

    parts
  end

  # ── Private Helpers ──────────────────────────────────────────────

  defp auto_excerpt(nil), do: ""
  defp auto_excerpt(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
    |> String.slice(0, 300)
  end

  defp ext_from_content_type("image/png"), do: "png"
  defp ext_from_content_type("image/gif"), do: "gif"
  defp ext_from_content_type("image/webp"), do: "webp"
  defp ext_from_content_type(_), do: "jpg"

  defp ssl_opts do
    [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check,
       [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]
  end

  defp http_opts do
    [
      {:ssl, ssl_opts()},
      {:timeout, 60_000},
      {:connect_timeout, 15_000}
    ]
  end

  # :httpc with body_format: :binary should return binary, but handle both cases
  defp ensure_binary(body) when is_binary(body), do: body
  defp ensure_binary(body) when is_list(body), do: :erlang.list_to_binary(body)

  defp http_post(url, headers, body) do
    :ssl.start()
    :inets.start()

    case :httpc.request(
           :post,
           {String.to_charlist(url), headers, ~c"application/json", String.to_charlist(body)},
           http_opts(),
           [{:body_format, :binary}]
         ) do
      {:ok, {{_, status, _}, _resp_headers, resp_body}} ->
        {:ok, {status, ensure_binary(resp_body)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp http_post_raw(url, headers, content_type, body) do
    :ssl.start()
    :inets.start()

    case :httpc.request(
           :post,
           {String.to_charlist(url), headers, content_type, body},
           http_opts(),
           [{:body_format, :binary}]
         ) do
      {:ok, {{_, status, _}, _resp_headers, resp_body}} ->
        {:ok, {status, ensure_binary(resp_body)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp http_delete(url, headers) do
    :ssl.start()
    :inets.start()

    case :httpc.request(
           :delete,
           {String.to_charlist(url), headers},
           http_opts(),
           [{:body_format, :binary}]
         ) do
      {:ok, {{_, status, _}, _resp_headers, resp_body}} ->
        {:ok, {status, ensure_binary(resp_body)}}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
