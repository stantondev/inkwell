defmodule Inkwell.Import.Parsers.MediumHtml do
  @moduledoc """
  Parser for Medium HTML export files.
  Accepts either:
  - A ZIP file containing HTML files in posts/ directory (Medium's download format)
  - A single HTML file (already extracted from the ZIP)
  Medium export: Settings → Account → Download your information → ZIP file.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  @impl true
  def parse(data) when is_binary(data) do
    if zip_file?(data) do
      parse_zip(data)
    else
      parse_single_html(data)
    end
  end

  # ZIP files start with PK magic bytes (0x50 0x4B)
  defp zip_file?(<<0x50, 0x4B, _::binary>>), do: true
  defp zip_file?(_), do: false

  defp parse_zip(data) do
    case :zip.unzip(data, [:memory]) do
      {:ok, files} ->
        # Check if ZIP has a posts/ directory (standard Medium export structure)
        has_posts_dir =
          Enum.any?(files, fn {name, _} ->
            name_str = to_string(name) |> String.downcase()
            String.starts_with?(name_str, "posts/") ||
              String.contains?(name_str, "/posts/")
          end)

        entries =
          files
          |> Enum.filter(fn {name, _content} ->
            name_str = to_string(name)
            lower = String.downcase(name_str)

            # Must be an HTML file
            (String.ends_with?(lower, ".html") || String.ends_with?(lower, ".htm")) &&
              # Skip OS junk
              !String.contains?(lower, "__macosx") &&
              !String.contains?(lower, ".ds_store") &&
              # If posts/ directory exists, only import from there
              if has_posts_dir do
                String.starts_with?(lower, "posts/") ||
                  String.contains?(lower, "/posts/")
              else
                # No posts/ dir: skip known non-post directories
                !String.contains?(lower, "/profile/") &&
                  !String.contains?(lower, "/lists/") &&
                  !String.contains?(lower, "/highlights/") &&
                  !String.contains?(lower, "/bookmarks/") &&
                  !String.contains?(lower, "/blocks/") &&
                  !String.contains?(lower, "/claps/") &&
                  !String.contains?(lower, "/sessions/") &&
                  !String.contains?(lower, "/ips/") &&
                  !String.contains?(lower, "/archive/") &&
                  !String.contains?(lower, "index.html")
              end
          end)
          |> Enum.map(fn {name, content} ->
            parse_html_file(to_string(name), to_string(content))
          end)
          |> Enum.reject(&is_nil/1)

        {:ok, entries}

      {:error, reason} ->
        {:error, "Failed to extract ZIP file: #{inspect(reason)}"}
    end
  rescue
    e ->
      {:error, "Failed to process ZIP file: #{Exception.message(e)}"}
  end

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

  defp parse_html_file(filename, html) do
    title = extract_title(html)
    published_at = extract_datetime(html)
    body = extract_body(html)
    tags = extract_tags(html)
    is_draft = String.contains?(String.downcase(filename), "draft")

    # Skip empty files
    if is_nil(title) && (is_nil(body) || body == "") do
      nil
    else
      %{
        title: title,
        body_html: body,
        mood: nil,
        music: nil,
        tags: tags,
        published_at: published_at,
        was_draft: is_draft
      }
    end
  end

  defp extract_title(html) do
    # Try h1, then h3 (Medium uses different heading levels across export versions)
    case Regex.run(~r/<h1[^>]*>(.*?)<\/h1>/s, html) do
      [_, title] -> strip_tags(title) |> String.trim()
      nil ->
        case Regex.run(~r/<h3[^>]*class="[^"]*p-name[^"]*"[^>]*>(.*?)<\/h3>/s, html) do
          [_, title] -> strip_tags(title) |> String.trim()
          nil ->
            case Regex.run(~r/<h3[^>]*>(.*?)<\/h3>/s, html) do
              [_, title] -> strip_tags(title) |> String.trim()
              nil -> nil
            end
        end
    end
  end

  defp extract_datetime(html) do
    case Regex.run(~r/<time[^>]*datetime="([^"]+)"/, html) do
      [_, datetime_str] -> Parser.parse_datetime(datetime_str)
      nil -> nil
    end
  end

  defp extract_body(html) do
    # Prefer e-content section (Medium's main body), then article, then body
    body =
      case Regex.run(~r/<section[^>]*class="[^"]*e-content[^"]*"[^>]*>(.*?)<\/section>/s, html) do
        [_, content] -> content
        nil ->
          case Regex.run(~r/<article[^>]*>(.*?)<\/article>/s, html) do
            [_, content] -> content
            nil ->
              case Regex.run(~r/<body[^>]*>(.*?)<\/body>/s, html) do
                [_, content] -> content
                nil -> html
              end
          end
      end

    # Remove the title (h1/h3) from the body to avoid duplication
    body =
      body
      |> String.replace(~r/<h1[^>]*>.*?<\/h1>/s, "")
      |> String.replace(~r/<h3[^>]*class="[^"]*graf--title[^"]*"[^>]*>.*?<\/h3>/s, "")

    # Remove header, subtitle section, footer (contains tags and metadata)
    body =
      body
      |> String.replace(~r/<header[^>]*>.*?<\/header>/s, "")
      |> String.replace(~r/<section[^>]*data-field="subtitle"[^>]*>.*?<\/section>/s, "")
      |> String.replace(~r/<footer[^>]*>.*?<\/footer>/s, "")

    # Remove time elements
    body = String.replace(body, ~r/<time[^>]*>.*?<\/time>/s, "")

    # Clean up
    body = String.trim(body)

    if body == "", do: nil, else: body
  end

  defp extract_tags(html) do
    # Medium puts tags in the footer as links with class "p-category"
    # Only use p-category links — other footer links are author, canonical, etc.
    Regex.scan(~r/<a[^>]*class="[^"]*p-category[^"]*"[^>]*>(.*?)<\/a>/s, html)
    |> Enum.map(fn [_, tag] -> strip_tags(tag) |> String.trim() end)
    |> Enum.reject(&(&1 == ""))
  end

  defp strip_tags(html) do
    String.replace(html, ~r/<[^>]+>/, "")
  end
end
