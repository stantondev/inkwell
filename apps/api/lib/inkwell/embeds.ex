defmodule Inkwell.Embeds do
  @moduledoc """
  Context for fetching URL metadata via oEmbed discovery, OpenGraph, Twitter Cards,
  and HTML fallback. Results are cached in PostgreSQL for 7 days.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Embeds.UrlEmbed

  @user_agent ~c"Inkwell/0.1 (+https://inkwell.social)"
  @fetch_timeout 10_000
  @connect_timeout 8_000
  @max_body_bytes 512_000
  @cache_ttl_days 7
  @cleanup_ttl_days 30

  # ── Public API ──

  @doc """
  Fetch URL metadata with caching. Returns {:ok, metadata_map} or {:error, reason}.
  """
  def fetch_url_metadata(url) when is_binary(url) do
    with :ok <- validate_url(url),
         :ok <- check_ssrf(url) do
      url_hash = hash_url(url)

      case get_cached(url_hash) do
        {:ok, cached} ->
          {:ok, format_result(cached)}

        :miss ->
          case do_fetch(url) do
            {:ok, metadata} ->
              store_cache(url_hash, url, metadata)
              {:ok, metadata}

            {:error, reason} ->
              {:error, reason}
          end
      end
    end
  end

  def fetch_url_metadata(_), do: {:error, :invalid_url}

  @doc "Delete cached URL embeds older than #{@cleanup_ttl_days} days."
  def cleanup_old_embeds do
    cutoff = DateTime.utc_now() |> DateTime.add(-@cleanup_ttl_days * 86_400, :second)

    {count, _} =
      from(e in UrlEmbed, where: e.fetched_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  # ── URL Validation & SSRF ──

  defp validate_url(url) do
    uri = URI.parse(url)

    cond do
      uri.scheme not in ["https"] ->
        {:error, :https_only}

      is_nil(uri.host) or uri.host == "" ->
        {:error, :invalid_url}

      true ->
        :ok
    end
  end

  defp check_ssrf(url) do
    uri = URI.parse(url)
    host = uri.host

    cond do
      host in ["localhost", "0.0.0.0", "127.0.0.1", "::1"] ->
        {:error, :blocked_host}

      String.ends_with?(host, ".local") ->
        {:error, :blocked_host}

      String.contains?(host, "fly.internal") ->
        {:error, :blocked_host}

      true ->
        check_resolved_ip(host)
    end
  end

  defp check_resolved_ip(host) do
    host_cl = String.to_charlist(host)

    case :inet.getaddr(host_cl, :inet) do
      {:ok, {a, b, _c, _d} = _ip} ->
        cond do
          a == 127 -> {:error, :blocked_host}
          a == 10 -> {:error, :blocked_host}
          a == 172 and b >= 16 and b <= 31 -> {:error, :blocked_host}
          a == 192 and b == 168 -> {:error, :blocked_host}
          a == 169 and b == 254 -> {:error, :blocked_host}
          a == 0 -> {:error, :blocked_host}
          true -> :ok
        end

      {:error, _} ->
        # Can't resolve — might be IPv6-only, allow the request
        :ok
    end
  end

  # ── Fetching ──

  defp do_fetch(url) do
    case http_get(url) do
      {:ok, {status, body, resp_headers}} when status in 200..299 ->
        content_type = get_content_type(resp_headers)

        if html_content?(content_type) do
          # Only parse <head> section for efficiency
          head_html = extract_head(body)
          metadata = parse_metadata(url, head_html, body)

          if metadata[:title] do
            {:ok, metadata}
          else
            {:error, :no_metadata}
          end
        else
          {:error, :not_html}
        end

      {:ok, {status, _, _}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("[Embeds] HTTP GET failed for #{url}: #{inspect(reason)}")
        {:error, :fetch_failed}
    end
  end

  defp http_get(url) do
    url_cl = String.to_charlist(url)
    headers = [{~c"user-agent", @user_agent}, {~c"accept", ~c"text/html,application/xhtml+xml"}]

    ssl_opts = [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check,
       [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]

    http_opts = [
      {:ssl, ssl_opts},
      {:timeout, @fetch_timeout},
      {:connect_timeout, @connect_timeout},
      {:autoredirect, true}
    ]

    case :httpc.request(:get, {url_cl, headers}, http_opts, [{:body_format, :binary}]) do
      {:ok, {{_, status, _}, resp_headers, body}} ->
        # Truncate body to max size
        body = if byte_size(body) > @max_body_bytes, do: binary_part(body, 0, @max_body_bytes), else: body
        {:ok, {status, body, resp_headers}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp get_content_type(headers) do
    headers
    |> Enum.find(fn {k, _v} -> String.downcase(to_string(k)) == "content-type" end)
    |> case do
      {_, v} -> to_string(v) |> String.downcase()
      nil -> ""
    end
  end

  defp html_content?(ct), do: String.contains?(ct, "html")

  defp extract_head(body) do
    case Regex.run(~r/<head[^>]*>(.*?)<\/head>/si, body) do
      [_, head] -> head
      _ -> body |> String.slice(0..10_000)
    end
  end

  # ── Metadata Parsing ──

  defp parse_metadata(url, head_html, _full_body) do
    uri = URI.parse(url)
    domain = uri.host || ""

    # Start with HTML fallback
    base = %{
      url: url,
      title: extract_title(head_html),
      description: extract_meta_description(head_html),
      thumbnail_url: nil,
      author_name: nil,
      provider_name: nil,
      site_name: nil,
      embed_type: "link",
      published_at: nil
    }

    # Layer OpenGraph
    og = parse_opengraph(head_html)
    merged = merge_metadata(base, og)

    # Layer Twitter Cards
    twitter = parse_twitter_cards(head_html)
    merged = merge_metadata(merged, twitter)

    # Layer oEmbed discovery (highest priority)
    oembed = discover_and_fetch_oembed(head_html, url)
    merged = merge_metadata(merged, oembed)

    # Derive provider from domain if still missing
    merged =
      if is_nil(merged[:provider_name]) or merged[:provider_name] == "" do
        Map.put(merged, :provider_name, domain)
      else
        merged
      end

    # Derive site_name from provider if missing
    merged =
      if is_nil(merged[:site_name]) or merged[:site_name] == "" do
        Map.put(merged, :site_name, merged[:provider_name])
      else
        merged
      end

    # Sanitize all string values
    sanitize_metadata(merged)
  end

  # ── HTML Fallback ──

  defp extract_title(html) do
    case Regex.run(~r/<title[^>]*>(.*?)<\/title>/si, html) do
      [_, title] -> title |> strip_tags() |> String.trim()
      _ -> nil
    end
  end

  defp extract_meta_description(html) do
    case Regex.run(~r/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i, html) do
      [_, desc] -> desc |> String.trim()
      _ ->
        case Regex.run(~r/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i, html) do
          [_, desc] -> desc |> String.trim()
          _ -> nil
        end
    end
  end

  # ── OpenGraph ──

  defp parse_opengraph(html) do
    tags = %{
      "og:title" => :title,
      "og:description" => :description,
      "og:image" => :thumbnail_url,
      "og:site_name" => :site_name,
      "og:type" => :embed_type,
      "og:url" => nil,
      "article:published_time" => :published_at,
      "article:author" => :author_name
    }

    Enum.reduce(tags, %{}, fn {og_prop, field}, acc ->
      case extract_og_tag(html, og_prop) do
        nil -> acc
        value when not is_nil(field) -> Map.put(acc, field, value)
        _ -> acc
      end
    end)
  end

  defp extract_og_tag(html, property) do
    # Try property="..." content="..." order
    case Regex.run(
           ~r/<meta[^>]*property=["']#{Regex.escape(property)}["'][^>]*content=["']([^"']*)["']/i,
           html
         ) do
      [_, value] ->
        value

      _ ->
        # Try content="..." property="..." order
        case Regex.run(
               ~r/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']#{Regex.escape(property)}["']/i,
               html
             ) do
          [_, value] -> value
          _ -> nil
        end
    end
  end

  # ── Twitter Cards ──

  defp parse_twitter_cards(html) do
    tags = %{
      "twitter:title" => :title,
      "twitter:description" => :description,
      "twitter:image" => :thumbnail_url,
      "twitter:creator" => :author_name
    }

    Enum.reduce(tags, %{}, fn {tw_name, field}, acc ->
      case extract_twitter_tag(html, tw_name) do
        nil -> acc
        value -> Map.put(acc, field, value)
      end
    end)
  end

  defp extract_twitter_tag(html, name) do
    case Regex.run(
           ~r/<meta[^>]*name=["']#{Regex.escape(name)}["'][^>]*content=["']([^"']*)["']/i,
           html
         ) do
      [_, value] ->
        value

      _ ->
        case Regex.run(
               ~r/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']#{Regex.escape(name)}["']/i,
               html
             ) do
          [_, value] -> value
          _ -> nil
        end
    end
  end

  # ── oEmbed Discovery ──

  defp discover_and_fetch_oembed(html, original_url) do
    case discover_oembed_endpoint(html) do
      nil ->
        %{}

      endpoint_url ->
        # Ensure the URL has the url param
        endpoint_url =
          if String.contains?(endpoint_url, "url=") do
            endpoint_url
          else
            separator = if String.contains?(endpoint_url, "?"), do: "&", else: "?"
            endpoint_url <> separator <> "url=" <> URI.encode_www_form(original_url)
          end

        # Add format and size params
        endpoint_url =
          if String.contains?(endpoint_url, "format=") do
            endpoint_url
          else
            endpoint_url <> "&format=json"
          end

        endpoint_url = endpoint_url <> "&maxwidth=600&maxheight=400"

        fetch_oembed_json(endpoint_url)
    end
  end

  defp discover_oembed_endpoint(html) do
    # Match <link rel="alternate" type="application/json+oembed" href="...">
    # Handle various attribute orderings
    patterns = [
      ~r/<link[^>]*rel=["']alternate["'][^>]*type=["']application\/json\+oembed["'][^>]*href=["']([^"']+)["']/i,
      ~r/<link[^>]*type=["']application\/json\+oembed["'][^>]*href=["']([^"']+)["']/i,
      ~r/<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/json\+oembed["']/i
    ]

    Enum.find_value(patterns, fn pattern ->
      case Regex.run(pattern, html) do
        [_, href] -> decode_html_entities(href)
        _ -> nil
      end
    end)
  end

  defp decode_html_entities(str) do
    str
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&apos;", "'")
    |> String.replace("&#39;", "'")
    |> decode_numeric_entities()
  end

  # Decode hex entities like &#x27; &#x2019; etc.
  defp decode_numeric_entities(str) do
    str = Regex.replace(~r/&#x([0-9a-fA-F]+);/, str, fn _, hex ->
      case Integer.parse(hex, 16) do
        {codepoint, ""} when codepoint > 0 and codepoint <= 0x10FFFF ->
          <<codepoint::utf8>>
        _ -> "&#x#{hex};"
      end
    end)

    Regex.replace(~r/&#(\d+);/, str, fn _, dec ->
      case Integer.parse(dec) do
        {codepoint, ""} when codepoint > 0 and codepoint <= 0x10FFFF ->
          <<codepoint::utf8>>
        _ -> "&##{dec};"
      end
    end)
  end

  defp fetch_oembed_json(endpoint_url) do
    case http_get(endpoint_url) do
      {:ok, {status, body, _}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, data} ->
            %{
              title: data["title"],
              author_name: data["author_name"],
              author_url: data["author_url"],
              provider_name: data["provider_name"],
              provider_url: data["provider_url"],
              thumbnail_url: data["thumbnail_url"],
              embed_type: data["type"] || "link"
            }
            |> Enum.reject(fn {_k, v} -> is_nil(v) or v == "" end)
            |> Map.new()

          {:error, _} ->
            Logger.debug("[Embeds] Failed to parse oEmbed JSON from #{endpoint_url}")
            %{}
        end

      _ ->
        %{}
    end
  end

  # ── Merge & Sanitize ──

  defp merge_metadata(base, overlay) do
    Enum.reduce(overlay, base, fn {key, value}, acc ->
      current = Map.get(acc, key)

      if is_nil(current) or current == "" do
        Map.put(acc, key, value)
      else
        acc
      end
    end)
  end

  defp sanitize_metadata(metadata) do
    metadata
    |> Map.update(:title, nil, &sanitize_string(&1, 300))
    |> Map.update(:description, nil, &sanitize_string(&1, 500))
    |> Map.update(:description, nil, &reject_garbage_description/1)
    |> Map.update(:thumbnail_url, nil, &sanitize_url(&1, 2048))
    |> Map.update(:author_name, nil, &sanitize_string(&1, 200))
    |> Map.update(:provider_name, nil, &sanitize_string(&1, 200))
    |> Map.update(:site_name, nil, &sanitize_string(&1, 200))
    |> Map.update(:published_at, nil, &sanitize_string(&1, 50))
    |> Map.update(:embed_type, "link", &sanitize_string(&1, 20))
  end

  defp sanitize_string(nil, _max), do: nil
  defp sanitize_string(str, max) when is_binary(str) do
    str
    |> strip_tags()
    |> decode_html_entities()
    |> String.trim()
    |> String.slice(0, max)
    |> case do
      "" -> nil
      s -> s
    end
  end
  defp sanitize_string(_, _), do: nil

  # Filter out garbage description values from poorly-coded sites
  defp reject_garbage_description(nil), do: nil
  defp reject_garbage_description(desc) when is_binary(desc) do
    if String.downcase(String.trim(desc)) in ["none", "null", "undefined", "n/a", "na"] do
      nil
    else
      desc
    end
  end

  defp sanitize_url(nil, _max), do: nil
  defp sanitize_url(url, max) when is_binary(url) do
    url = String.trim(url)

    cond do
      String.starts_with?(url, "https://") and String.length(url) <= max -> url
      String.starts_with?(url, "http://") and String.length(url) <= max -> url
      true -> nil
    end
  end
  defp sanitize_url(_, _), do: nil

  defp strip_tags(nil), do: ""
  defp strip_tags(html) when is_binary(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  # ── Caching ──

  defp hash_url(url) do
    normalized = normalize_url(url)
    :crypto.hash(:sha256, normalized) |> Base.encode16(case: :lower)
  end

  defp normalize_url(url) do
    uri = URI.parse(url)

    # Lowercase scheme and host
    scheme = (uri.scheme || "https") |> String.downcase()
    host = (uri.host || "") |> String.downcase()

    # Strip trailing slash from path
    path = (uri.path || "/") |> String.replace(~r/\/+$/, "")
    path = if path == "", do: "/", else: path

    # Strip utm_* tracking params from query
    query =
      case uri.query do
        nil ->
          nil

        q ->
          q
          |> URI.decode_query()
          |> Enum.reject(fn {k, _v} -> String.starts_with?(k, "utm_") end)
          |> Enum.sort()
          |> URI.encode_query()
          |> case do
            "" -> nil
            q -> q
          end
      end

    base = "#{scheme}://#{host}#{path}"
    if query, do: "#{base}?#{query}", else: base
  end

  defp get_cached(url_hash) do
    cutoff = DateTime.utc_now() |> DateTime.add(-@cache_ttl_days * 86_400, :second)

    case Repo.one(
           from(e in UrlEmbed,
             where: e.url_hash == ^url_hash and e.fetched_at > ^cutoff
           )
         ) do
      nil -> :miss
      embed -> {:ok, embed}
    end
  end

  defp store_cache(url_hash, url, metadata) do
    attrs =
      metadata
      |> Map.put(:url_hash, url_hash)
      |> Map.put(:url, url)
      |> Map.put(:fetched_at, DateTime.utc_now())

    %UrlEmbed{}
    |> UrlEmbed.changeset(attrs)
    |> Repo.insert(
      on_conflict:
        {:replace,
         [
           :title, :description, :thumbnail_url, :author_name, :author_url,
           :provider_name, :provider_url, :site_name, :embed_type,
           :published_at, :fetched_at, :updated_at
         ]},
      conflict_target: [:url_hash]
    )
  rescue
    e ->
      Logger.warning("[Embeds] Failed to cache URL embed: #{inspect(e)}")
      :ok
  end

  defp format_result(%UrlEmbed{} = e) do
    %{
      url: e.url,
      title: e.title,
      description: e.description,
      thumbnail_url: e.thumbnail_url,
      author_name: e.author_name,
      provider_name: e.provider_name,
      site_name: e.site_name,
      embed_type: e.embed_type,
      published_at: e.published_at
    }
  end
end
