defmodule Inkwell.Import.Parsers.MediumHtml do
  @moduledoc """
  Parser for Medium HTML export (ZIP file containing HTML files in posts/ directory).
  Medium export: Settings → Account → Download your information → ZIP file.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  @impl true
  def parse(data) when is_binary(data) do
    case :zip.unzip(data, [:memory]) do
      {:ok, files} ->
        entries =
          files
          |> Enum.filter(fn {name, _content} ->
            name_str = to_string(name)
            String.contains?(name_str, "posts/") && String.ends_with?(name_str, ".html")
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
    # Try to extract content between article tags or section tags
    body =
      case Regex.run(~r/<article[^>]*>(.*?)<\/article>/s, html) do
        [_, content] -> content
        nil ->
          case Regex.run(~r/<section[^>]*class="[^"]*e-content[^"]*"[^>]*>(.*?)<\/section>/s, html) do
            [_, content] -> content
            nil ->
              # Fallback: get body content
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
      |> String.replace(~r/<h3[^>]*class="[^"]*p-name[^"]*"[^>]*>.*?<\/h3>/s, "")

    # Remove footer (contains tags and metadata)
    body = String.replace(body, ~r/<footer[^>]*>.*?<\/footer>/s, "")

    # Remove time elements
    body = String.replace(body, ~r/<time[^>]*>.*?<\/time>/s, "")

    # Clean up
    body = String.trim(body)

    if body == "", do: nil, else: body
  end

  defp extract_tags(html) do
    # Medium puts tags in the footer as links with class "p-category"
    case Regex.scan(~r/<a[^>]*class="[^"]*p-category[^"]*"[^>]*>(.*?)<\/a>/s, html) do
      matches when matches != [] ->
        Enum.map(matches, fn [_, tag] -> strip_tags(tag) |> String.trim() end)
        |> Enum.reject(&(&1 == ""))

      _ ->
        # Fallback: look for tags in footer links
        case Regex.run(~r/<footer[^>]*>(.*?)<\/footer>/s, html) do
          [_, footer] ->
            Regex.scan(~r/<a[^>]*>(.*?)<\/a>/s, footer)
            |> Enum.map(fn [_, tag] -> strip_tags(tag) |> String.trim() end)
            |> Enum.reject(&(&1 == ""))

          nil ->
            []
        end
    end
  end

  defp strip_tags(html) do
    String.replace(html, ~r/<[^>]+>/, "")
  end
end
