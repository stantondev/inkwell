defmodule Inkwell.Import.Parsers.Substack do
  @moduledoc """
  Parser for Substack exports. Handles three input types:
  - ZIP file containing HTML posts (from Substack "Download your data")
  - Single HTML file (extracted post)
  - CSV file (from Substack "Export posts")

  Auto-detects which format was provided and parses accordingly.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  @impl true
  def parse(data) when is_binary(data) do
    cond do
      zip_file?(data) -> parse_zip(data)
      csv_data?(data) -> parse_csv(data)
      true -> parse_single_html(data)
    end
  end

  # ── Format detection ──

  defp zip_file?(<<0x50, 0x4B, _::binary>>), do: true
  defp zip_file?(_), do: false

  defp csv_data?(data) do
    # Check if first non-empty line looks like CSV headers (not HTML)
    first_line =
      data
      |> String.split(~r/\r?\n/, parts: 2)
      |> List.first("")
      |> String.trim()

    !String.starts_with?(first_line, "<") &&
      String.contains?(first_line, ",") &&
      Enum.any?(
        ~w(title post_date subtitle body_html is_published),
        &String.contains?(String.downcase(first_line), &1)
      )
  end

  # ── ZIP parsing ──

  defp parse_zip(data) do
    case :zip.unzip(data, [:memory]) do
      {:ok, files} ->
        # Look for CSV file first (structured data, preferred)
        csv_file =
          Enum.find(files, fn {name, _} ->
            name_str = to_string(name)
            String.ends_with?(name_str, ".csv") && !hidden_file?(name_str)
          end)

        # Try CSV first, but only if it has actual body content.
        # Substack "Download your data" ZIPs include a metadata-only CSV
        # (no body_html column) — the real content is in the HTML files.
        csv_result =
          case csv_file do
            {_name, csv_data} ->
              case parse_csv(to_string(csv_data)) do
                {:ok, entries} when entries != [] ->
                  # Only use CSV if at least one entry has body content
                  has_content = Enum.any?(entries, fn e -> e.body_html != nil && e.body_html != "" end)
                  if has_content, do: {:ok, entries}, else: nil
                _ ->
                  nil
              end
            nil ->
              nil
          end

        case csv_result do
          {:ok, _} = result ->
            result

          nil ->
            # Parse HTML files, filtering out non-post content
            entries =
              files
              |> Enum.filter(fn {name, _} ->
                name_str = to_string(name)

                (String.ends_with?(name_str, ".html") ||
                   String.ends_with?(name_str, ".htm")) &&
                  is_content_file?(name_str)
              end)
              |> Enum.map(fn {name, content} ->
                parse_html_file(to_string(name), to_string(content))
              end)
              |> Enum.reject(&is_nil/1)

            {:ok, entries}
        end

      {:error, reason} ->
        {:error, "Failed to extract ZIP file: #{inspect(reason)}"}
    end
  rescue
    e ->
      {:error, "Failed to process ZIP file: #{Exception.message(e)}"}
  end

  # Filter out non-post files from ZIP
  defp is_content_file?(name) do
    lower = String.downcase(name)

    # Skip OS/editor junk files
    !hidden_file?(lower) &&
      # Skip known non-post directories/files
      !String.contains?(lower, "index.html") &&
      !String.contains?(lower, "/profile/") &&
      !String.contains?(lower, "/about") &&
      !String.contains?(lower, "/settings/") &&
      !String.contains?(lower, "/subscribers/") &&
      !String.contains?(lower, "/lists/") &&
      !String.contains?(lower, "/highlights/") &&
      !String.contains?(lower, "/bookmarks/") &&
      !String.contains?(lower, "/blocks/") &&
      !String.contains?(lower, "/claps/") &&
      !String.contains?(lower, "/sessions/") &&
      !String.contains?(lower, "/ips/") &&
      !String.contains?(lower, "/archive/") &&
      !String.contains?(lower, "/css/") &&
      !String.contains?(lower, "/js/") &&
      !String.contains?(lower, "/images/") &&
      !String.contains?(lower, "/assets/")
  end

  defp hidden_file?(name) do
    String.contains?(name, "__MACOSX") ||
      String.contains?(name, ".DS_Store") ||
      String.contains?(name, "Thumbs.db")
  end

  # ── CSV parsing (delegates to SubstackCsv) ──

  defp parse_csv(data) do
    Inkwell.Import.Parsers.SubstackCsv.parse(data)
  end

  # ── Single HTML parsing ──

  defp parse_single_html(data) do
    html = to_string(data)

    case parse_html_file("uploaded.html", html) do
      nil -> {:ok, []}
      entry -> {:ok, [entry]}
    end
  rescue
    e ->
      {:error, "Failed to parse HTML file: #{Exception.message(e)}"}
  end

  # ── HTML post extraction ──

  defp parse_html_file(filename, html) do
    title = extract_title(html) || title_from_filename(filename)
    body = extract_body(html)
    published_at = extract_datetime(html)
    is_draft = String.contains?(String.downcase(filename), "draft")

    # Skip empty files and non-content pages
    cond do
      is_nil(body) || body == "" -> nil
      non_post_page?(html) -> nil
      true ->
        %{
          title: title,
          body_html: body,
          mood: nil,
          music: nil,
          tags: extract_tags(html),
          published_at: published_at,
          was_draft: is_draft
        }
    end
  end

  # Derive title from filename when no HTML title exists.
  # Substack filenames: "182854666.how-to-use-the-substack-editor.html"
  # or with path: "FWarew0eQBuqigTEpueM6w/posts/182854666.how-to-use-the-substack-editor.html"
  defp title_from_filename(filename) do
    basename =
      filename
      |> Path.basename()
      |> Path.rootname()

    # Strip leading numeric ID prefix (e.g., "182854666.")
    slug =
      case Regex.run(~r/^\d+\.(.+)$/, basename) do
        [_, rest] -> rest
        _ -> basename
      end

    case slug do
      "" -> nil
      "uploaded" -> nil
      s ->
        s
        |> String.replace(~r/[-_]+/, " ")
        |> String.split()
        |> Enum.map_join(" ", &String.capitalize/1)
    end
  end

  # Detect non-post pages (settings pages, archive listings, etc.)
  defp non_post_page?(html) do
    lower = String.downcase(html)

    # Pages that are clearly not posts
    (String.contains?(lower, "manage your subscription") &&
       !String.contains?(lower, "<article")) ||
      (String.contains?(lower, "subscriber settings") &&
         !String.contains?(lower, "<article"))
  end

  # ── Title extraction ──

  defp extract_title(html) do
    first_match(html, [
      # Substack post-title class
      ~r/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>(.*?)<\/h1>/s,
      # Substack h1 with data attribute
      ~r/<h1[^>]*data-testid="[^"]*"[^>]*>(.*?)<\/h1>/s,
      # Generic h1
      ~r/<h1[^>]*>(.*?)<\/h1>/s,
      # HTML title tag (strip " - Publication Name" suffix)
      ~r/<title[^>]*>(.*?)<\/title>/s,
      # Fallback h2
      ~r/<h2[^>]*class="[^"]*post-title[^"]*"[^>]*>(.*?)<\/h2>/s,
      ~r/<h2[^>]*>(.*?)<\/h2>/s
    ])
    |> clean_title()
  end

  defp clean_title(nil), do: nil

  defp clean_title(title) do
    title
    # Remove " - Publication Name" or " | Publication" suffix from <title>
    |> String.replace(~r/\s*[-|]\s*[^-|]+$/, "")
    |> String.trim()
    |> case do
      "" -> nil
      t -> t
    end
  end

  # ── Body extraction ──

  defp extract_body(html) do
    body =
      first_match_raw(html, [
        # Substack content containers
        ~r/<div[^>]*class="[^"]*body\s+markup[^"]*"[^>]*>(.*)<\/div>\s*(?:<\/div>|\s*<div[^>]*class="[^"]*post-footer)/s,
        ~r/<div[^>]*class="[^"]*body\s+markup[^"]*"[^>]*>(.*?)<\/div>/s,
        ~r/<div[^>]*class="[^"]*available-content[^"]*"[^>]*>(.*?)<\/div>/s,
        ~r/<div[^>]*class="[^"]*post-content[^"]*"[^>]*>(.*?)<\/div>/s,
        ~r/<div[^>]*class="[^"]*cashtag[^"]*"[^>]*>(.*?)<\/div>/s,
        # Generic containers
        ~r/<article[^>]*>(.*?)<\/article>/s,
        ~r/<main[^>]*>(.*?)<\/main>/s,
        ~r/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)<\/div>/s,
        ~r/<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/s,
        # Last resort: body tag
        ~r/<body[^>]*>(.*?)<\/body>/s
      ])

    # Fallback for HTML fragments (Substack exports raw HTML with no container)
    body = body || fragment_body(html)

    case body do
      nil ->
        nil

      content ->
        clean_body(content)
    end
  end

  # For HTML fragments that have no container element — the entire content IS the body.
  # Substack "Download your data" exports raw HTML fragments starting with <p> tags.
  defp fragment_body(html) do
    trimmed = String.trim(html)

    # Only treat as fragment if it starts with an inline HTML tag (not a full page)
    is_fragment =
      Regex.match?(~r/^<(?:p|div|blockquote|ul|ol|h[2-6]|figure|table|section|pre|img)\b/i, trimmed)

    if is_fragment && String.length(trimmed) > 0 do
      trimmed
    else
      nil
    end
  end

  defp clean_body(content) do
    content
    # Remove title duplication
    |> String.replace(~r/<h1[^>]*>.*?<\/h1>/s, "")
    |> String.replace(~r/<h2[^>]*class="[^"]*post-title[^"]*"[^>]*>.*?<\/h2>/s, "")
    # Remove Substack subscribe/CTA buttons (fragment format uses <p class="button-wrapper">)
    |> String.replace(~r/<p[^>]*class="[^"]*button-wrapper[^"]*"[^>]*>.*?<\/p>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*subscription-widget[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*subscribe[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*paywall[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*post-footer[^"]*"[^>]*>.*?<\/div>/s, "")
    # Remove share buttons
    |> String.replace(~r/<div[^>]*class="[^"]*share[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*like-button[^"]*"[^>]*>.*?<\/div>/s, "")
    # Remove Substack embed containers (tweets, YouTube, Spotify, etc.)
    |> String.replace(~r/<div[^>]*class="[^"]*twitter-embed[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*youtube-wrap[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*vimeo-wrap[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<div[^>]*class="[^"]*soundcloud-wrap[^"]*"[^>]*>.*?<\/div>/s, "")
    |> String.replace(~r/<iframe[^>]*class="[^"]*spotify-wrap[^"]*"[^>]*>.*?<\/iframe>/s, "")
    # Remove navigation
    |> String.replace(~r/<nav[^>]*>.*?<\/nav>/s, "")
    |> String.replace(~r/<header[^>]*>.*?<\/header>/s, "")
    |> String.replace(~r/<footer[^>]*>.*?<\/footer>/s, "")
    # Clean up whitespace
    |> String.trim()
    |> case do
      "" -> nil
      cleaned -> cleaned
    end
  end

  # ── Date extraction ──

  defp extract_datetime(html) do
    result =
      first_match_raw(html, [
        ~r/<time[^>]*datetime="([^"]+)"/,
        ~r/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/,
        ~r/<meta[^>]*content="([^"]+)"[^>]*property="article:published_time"/,
        ~r/<meta[^>]*name="publish_date"[^>]*content="([^"]+)"/,
        ~r/<meta[^>]*name="date"[^>]*content="([^"]+)"/
      ])

    case result do
      nil -> nil
      datetime_str -> Parser.parse_datetime(datetime_str)
    end
  end

  # ── Tag extraction ──

  defp extract_tags(html) do
    # Substack uses various tag patterns
    tags =
      Regex.scan(~r/<a[^>]*class="[^"]*p-category[^"]*"[^>]*>(.*?)<\/a>/s, html)
      |> Enum.map(fn [_, tag] -> strip_tags(tag) |> String.trim() end)
      |> Enum.reject(&(&1 == ""))

    if tags == [] do
      # Try meta keywords
      case Regex.run(~r/<meta[^>]*name="keywords"[^>]*content="([^"]+)"/, html) do
        [_, keywords] ->
          keywords
          |> String.split(",")
          |> Enum.map(&String.trim/1)
          |> Enum.reject(&(&1 == ""))

        nil ->
          []
      end
    else
      tags
    end
  end

  # ── Helpers ──

  defp first_match(html, patterns) do
    Enum.find_value(patterns, fn pattern ->
      case Regex.run(pattern, html) do
        [_, capture] ->
          result = capture |> strip_tags() |> String.trim()
          if result == "", do: nil, else: result

        _ ->
          nil
      end
    end)
  end

  defp first_match_raw(html, patterns) do
    Enum.find_value(patterns, fn pattern ->
      case Regex.run(pattern, html) do
        [_, capture] ->
          trimmed = String.trim(capture)
          if trimmed == "", do: nil, else: trimmed

        _ ->
          nil
      end
    end)
  end

  defp strip_tags(html) do
    String.replace(html, ~r/<[^>]+>/, "")
  end
end
