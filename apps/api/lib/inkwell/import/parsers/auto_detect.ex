defmodule Inkwell.Import.Parsers.AutoDetect do
  @moduledoc """
  Auto-detects the import format from file contents and delegates
  to the appropriate parser. Examines magic bytes, file structure,
  and content markers to determine the correct parser.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parsers.{
    InkwellJson,
    GenericCsv,
    GenericJson,
    WordpressWxr,
    MediumHtml,
    Substack
  }

  @impl true
  def parse(data) when is_binary(data) do
    # Decompress gzip first if needed
    data =
      if gzip_file?(data) do
        try do
          :zlib.gunzip(data)
        rescue
          _ -> data
        end
      else
        data
      end

    case detect_and_parse(data) do
      {:ok, entries} -> {:ok, entries}
      {:error, reason} -> {:error, reason}
    end
  end

  defp detect_and_parse(data) do
    cond do
      zip_file?(data) -> detect_and_parse_zip(data)
      xml_data?(data) -> WordpressWxr.parse(data)
      json_data?(data) -> detect_and_parse_json(data)
      html_data?(data) -> detect_and_parse_html(data)
      csv_data?(data) -> detect_and_parse_csv(data)
      true -> {:error, "Unable to detect file format. Try selecting a specific format from the dropdown."}
    end
  end

  # ── Format detection ──

  defp gzip_file?(<<0x1F, 0x8B, _::binary>>), do: true
  defp gzip_file?(_), do: false

  defp zip_file?(<<0x50, 0x4B, _::binary>>), do: true
  defp zip_file?(_), do: false

  defp xml_data?(data) do
    trimmed = String.trim_leading(data)

    String.starts_with?(trimmed, "<?xml") ||
      String.starts_with?(trimmed, "<rss") ||
      String.starts_with?(trimmed, "<feed")
  end

  defp json_data?(data) do
    trimmed = String.trim_leading(data)
    String.starts_with?(trimmed, "{") || String.starts_with?(trimmed, "[")
  end

  defp html_data?(data) do
    trimmed = String.trim_leading(data) |> String.downcase()

    # Full HTML pages
    String.starts_with?(trimmed, "<!doctype") ||
      String.starts_with?(trimmed, "<html") ||
      String.starts_with?(trimmed, "<head") ||
      String.starts_with?(trimmed, "<body") ||
      String.starts_with?(trimmed, "<article") ||
      # HTML fragments (Substack exports raw fragments starting with content tags)
      Regex.match?(~r/^<(?:p|div|blockquote|ul|ol|h[2-6]|figure|table|section|pre)\b/i, trimmed)
  end

  defp csv_data?(data) do
    first_line =
      data
      |> String.split(~r/\r?\n/, parts: 2)
      |> List.first("")
      |> String.trim()

    # Has commas, doesn't start with HTML/XML tags
    !String.starts_with?(first_line, "<") &&
      String.contains?(first_line, ",") &&
      String.length(first_line) < 1000
  end

  # ── ZIP format detection ──

  defp detect_and_parse_zip(data) do
    case :zip.unzip(data, [:memory]) do
      {:ok, files} ->
        filenames = Enum.map(files, fn {name, _} -> to_string(name) end)
        lower_names = Enum.map(filenames, &String.downcase/1)

        has_posts_dir =
          Enum.any?(lower_names, fn n ->
            String.starts_with?(n, "posts/") && String.ends_with?(n, ".html")
          end)

        has_xml = Enum.any?(lower_names, &String.ends_with?(&1, ".xml"))

        has_csv =
          Enum.any?(lower_names, fn n ->
            String.ends_with?(n, ".csv") && !String.contains?(n, "__macosx")
          end)

        has_html =
          Enum.any?(lower_names, fn n ->
            (String.ends_with?(n, ".html") || String.ends_with?(n, ".htm")) &&
              !String.contains?(n, "__macosx")
          end)

        has_json =
          Enum.any?(lower_names, fn n ->
            String.ends_with?(n, ".json") && !String.contains?(n, "__macosx")
          end)

        cond do
          # Both Medium and Substack use posts/ directory — peek at content to distinguish
          has_posts_dir -> detect_posts_dir_format(files, data)
          # WordPress: has WXR XML file
          has_xml -> parse_xml_from_zip(files)
          # Substack or generic: has CSV or HTML files
          has_csv || has_html -> Substack.parse(data)
          # JSON files
          has_json -> parse_json_from_zip(files)
          true ->
            {:error,
             "ZIP file doesn't contain recognizable content (no HTML, CSV, XML, or JSON files found)."}
        end

      {:error, reason} ->
        {:error, "Failed to read ZIP file: #{inspect(reason)}"}
    end
  rescue
    e ->
      {:error, "Failed to process ZIP file: #{Exception.message(e)}"}
  end

  defp parse_xml_from_zip(files) do
    case Enum.find(files, fn {name, _} -> String.ends_with?(to_string(name), ".xml") end) do
      {_, xml_data} -> WordpressWxr.parse(to_string(xml_data))
      nil -> {:error, "No XML file found in ZIP"}
    end
  end

  defp parse_json_from_zip(files) do
    case Enum.find(files, fn {name, _} -> String.ends_with?(to_string(name), ".json") end) do
      {_, json_data} -> InkwellJson.parse(to_string(json_data))
      nil -> {:error, "No JSON file found in ZIP"}
    end
  end

  # Both Medium and Substack ZIPs can have a posts/ directory.
  # Peek at the first HTML file to distinguish:
  # - Medium: full HTML pages with microformat classes (e-content, p-name, graf--)
  # - Substack: raw HTML fragments starting with <p>, <div>, etc. (no <html> wrapper)
  defp detect_posts_dir_format(files, data) do
    sample_html =
      files
      |> Enum.find(fn {name, _} ->
        name_str = to_string(name) |> String.downcase()
        String.contains?(name_str, "posts/") && String.ends_with?(name_str, ".html")
      end)

    case sample_html do
      {_, content} ->
        html = to_string(content)

        is_medium =
          String.contains?(html, "e-content") ||
            String.contains?(html, "p-name") ||
            String.contains?(html, "graf--") ||
            String.contains?(html, "medium.com") ||
            # Medium exports are full HTML pages with <html> wrapper
            Regex.match?(~r/^\s*<!doctype/i, html)

        if is_medium do
          MediumHtml.parse(data)
        else
          Substack.parse(data)
        end

      nil ->
        # No HTML in posts/ dir, try Substack (handles CSV too)
        Substack.parse(data)
    end
  end

  # ── JSON format detection ──

  defp detect_and_parse_json(data) do
    # Peek at the JSON structure to determine format
    case Jason.decode(data) do
      {:ok, %{"entries" => entries}} when is_list(entries) -> InkwellJson.parse(data)
      {:ok, %{"drafts" => _}} -> InkwellJson.parse(data)
      {:ok, list} when is_list(list) ->
        # Check if it looks like Inkwell format (has body_html keys)
        if Enum.any?(list, &is_map/1) && Enum.any?(list, &Map.has_key?(&1, "body_html")) do
          InkwellJson.parse(data)
        else
          GenericJson.parse(data)
        end
      {:ok, %{}} -> GenericJson.parse(data)
      {:error, _} -> {:error, "File appears to be JSON but couldn't be parsed."}
    end
  end

  # ── HTML format detection ──

  defp detect_and_parse_html(data) do
    # Check for Medium-specific markers
    has_medium_markers =
      String.contains?(data, "e-content") ||
        String.contains?(data, "p-name") ||
        String.contains?(data, "graf--title") ||
        String.contains?(data, "medium.com")

    if has_medium_markers do
      MediumHtml.parse(data)
    else
      # Default to Substack parser (handles generic HTML well)
      Substack.parse(data)
    end
  end

  # ── CSV format detection ──

  defp detect_and_parse_csv(data) do
    first_line =
      data
      |> String.split(~r/\r?\n/, parts: 2)
      |> List.first("")
      |> String.downcase()

    # Check for Substack-specific column names
    is_substack =
      String.contains?(first_line, "post_date") ||
        (String.contains?(first_line, "subtitle") && String.contains?(first_line, "body_html"))

    if is_substack do
      Substack.parse(data)
    else
      GenericCsv.parse(data)
    end
  end
end
