defmodule Inkwell.Workers.LinkPreviewWorker do
  @moduledoc """
  Oban worker that enriches remote (fediverse) entries with link preview cards.

  Extracts the main standalone link from body_html, fetches OG/Twitter Card metadata
  via the Embeds module, and appends a `<div data-link-embed>` block to body_html.
  This reuses the same HTML structure as TipTap's LinkEmbed node, so the existing
  `.link-embed-card` CSS renders it automatically with no frontend changes.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 2,
    priority: 4,
    unique: [keys: [:remote_entry_id], period: 300]

  require Logger

  alias Inkwell.Federation.RemoteEntries
  alias Inkwell.Embeds

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"remote_entry_id" => remote_entry_id}}) do
    case RemoteEntries.get_remote_entry(remote_entry_id) do
      nil ->
        Logger.debug("[LinkPreview] Remote entry #{remote_entry_id} not found, skipping")
        :ok

      entry ->
        enrich_entry(entry)
    end
  end

  defp enrich_entry(entry) do
    body = entry.body_html || ""

    # Skip if already enriched
    if String.contains?(body, "data-link-embed") do
      Logger.debug("[LinkPreview] Entry #{entry.id} already has link preview, skipping")
      :ok
    else
      case extract_main_link(body) do
        nil ->
          Logger.debug("[LinkPreview] No standalone link found in entry #{entry.id}")
          :ok

        url ->
          case Embeds.fetch_url_metadata(url) do
            {:ok, metadata} when is_map(metadata) ->
              embed_html = build_embed_html(metadata)
              new_body = body <> embed_html

              case RemoteEntries.update_body_html(entry, new_body) do
                {:ok, _} ->
                  Logger.info("[LinkPreview] Enriched entry #{entry.id} with preview for #{url}")
                  :ok

                {:error, reason} ->
                  Logger.warning("[LinkPreview] Failed to update entry #{entry.id}: #{inspect(reason)}")
                  :ok
              end

            {:error, reason} ->
              Logger.debug("[LinkPreview] Failed to fetch metadata for #{url}: #{inspect(reason)}")
              :ok
          end
      end
    end
  end

  @doc """
  Extract the main standalone link from fediverse HTML content.

  Strategy: find the last `<a>` tag that is NOT a hashtag or mention,
  and whose href is an HTTPS URL. This matches how fediverse posts typically
  end with "here's the link I'm sharing".
  """
  def extract_main_link(html) when is_binary(html) do
    # Find all <a> tags with href
    links =
      Regex.scan(~r/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/si, html)
      |> Enum.map(fn [_full, href, text] -> {href, text} end)
      |> Enum.filter(fn {href, text} ->
        # Must be HTTPS
        String.starts_with?(href, "https://") &&
          # Skip hashtag links (class contains "hashtag" or "mention", or text starts with #)
          not is_hashtag_or_mention?(href, text)
      end)

    case List.last(links) do
      {url, _text} -> url
      nil -> nil
    end
  end

  def extract_main_link(_), do: nil

  defp is_hashtag_or_mention?(href, text) do
    text_stripped = String.trim(text)

    # Hashtags: text starts with # or href contains /tags/
    String.starts_with?(text_stripped, "#") ||
      String.contains?(href, "/tags/") ||
      String.contains?(href, "/tag/") ||
      # Mentions: text starts with @ or href contains /@
      String.starts_with?(text_stripped, "@") ||
      Regex.match?(~r/\/@[^\/]+\/?$/, href)
  end

  @doc """
  Build the link embed HTML matching TipTap's LinkEmbed node output.
  """
  def build_embed_html(metadata) do
    url = escape_attr(metadata[:url] || "")
    title = escape_attr(metadata[:title] || "")
    description = escape_attr(metadata[:description] || "")
    thumbnail = escape_attr(metadata[:thumbnail_url] || "")
    author = escape_attr(metadata[:author_name] || "")
    provider = escape_attr(metadata[:provider_name] || "")
    site = escape_attr(metadata[:site_name] || "")
    published = escape_attr(metadata[:published_at] || "")
    embed_type = escape_attr(metadata[:embed_type] || "link")

    domain = extract_domain(metadata[:url] || "")

    # Build inner content spans
    thumbnail_span =
      if thumbnail != "" do
        "<span class=\"link-embed-thumbnail\" style=\"background-image: url(#{thumbnail})\"></span>"
      else
        ""
      end

    provider_span =
      if provider != "" do
        ~s(<span class="link-embed-provider">#{escape_html(metadata[:provider_name] || "")}</span>)
      else
        ""
      end

    title_span =
      if title != "" do
        ~s(<span class="link-embed-title">#{escape_html(metadata[:title] || "")}</span>)
      else
        ""
      end

    description_span =
      if description != "" do
        ~s(<span class="link-embed-description">#{escape_html(metadata[:description] || "")}</span>)
      else
        ""
      end

    byline_parts =
      [metadata[:author_name], metadata[:published_at]]
      |> Enum.reject(&(is_nil(&1) or &1 == ""))

    byline_span =
      if byline_parts != [] do
        ~s(<span class="link-embed-byline">#{escape_html(Enum.join(byline_parts, " · "))}</span>)
      else
        ""
      end

    domain_span =
      if domain != "" do
        ~s(<span class="link-embed-domain">#{escape_html(domain)}</span>)
      else
        ""
      end

    ~s(<div data-link-embed="" ) <>
      ~s(data-link-url="#{url}" ) <>
      ~s(data-link-title="#{title}" ) <>
      ~s(data-link-description="#{description}" ) <>
      ~s(data-link-thumbnail="#{thumbnail}" ) <>
      ~s(data-link-author="#{author}" ) <>
      ~s(data-link-provider="#{provider}" ) <>
      ~s(data-link-site="#{site}" ) <>
      ~s(data-link-published="#{published}" ) <>
      ~s(data-link-type="#{embed_type}">) <>
      ~s(<a href="#{url}" class="link-embed-card" target="_blank" rel="noopener noreferrer">) <>
      thumbnail_span <>
      ~s(<span class="link-embed-content">) <>
      provider_span <> title_span <> description_span <> byline_span <> domain_span <>
      ~s(</span></a></div>)
  end

  defp extract_domain(url) when is_binary(url) do
    case URI.parse(url) do
      %{host: host} when is_binary(host) -> host
      _ -> ""
    end
  end

  defp extract_domain(_), do: ""

  defp escape_attr(nil), do: ""

  defp escape_attr(str) when is_binary(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("\"", "&quot;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
  end

  defp escape_html(nil), do: ""

  defp escape_html(str) when is_binary(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end
end
