defmodule Inkwell.Import.Parsers.SubstackCsv do
  @moduledoc """
  Parser for Substack CSV exports.
  Substack columns: title, subtitle, post_date, body_html, is_published, url, slug, audience
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  NimbleCSV.define(Inkwell.Import.Parsers.SubstackCsv.CSV, separator: ",", escape: "\"")

  @impl true
  def parse(data) when is_binary(data) do
    data = strip_bom(data)

    lines = String.split(data, ~r/\r?\n/, trim: true)

    case lines do
      [] ->
        {:error, "CSV file is empty"}

      [_header_only] ->
        {:ok, []}

      [header_line | _rest] ->
        headers =
          header_line
          |> String.split(",")
          |> Enum.map(&(String.trim(&1) |> String.downcase() |> String.replace(~r/^"(.*)"$/, "\\1")))

        try do
          rows = __MODULE__.CSV.parse_string(data, skip_headers: true)

          entries =
            rows
            |> Enum.map(fn row -> parse_row(headers, row) end)
            |> Enum.reject(fn entry -> is_nil(entry.body_html) && is_nil(entry.title) end)

          {:ok, entries}
        rescue
          e ->
            {:error, "CSV parse error: #{Exception.message(e)}"}
        end
    end
  end

  defp parse_row(headers, row) do
    map =
      headers
      |> Enum.zip(row)
      |> Map.new()

    title = get_val(map, "title")
    subtitle = get_val(map, "subtitle")
    body_html = get_val(map, "body_html") || get_val(map, "body")

    # Prepend subtitle as emphasized paragraph if present
    full_body =
      case {subtitle, body_html} do
        {nil, body} -> body
        {sub, nil} -> "<p><em>#{sub}</em></p>"
        {sub, body} -> "<p><em>#{sub}</em></p>\n#{body}"
      end

    is_published = get_val(map, "is_published")

    %{
      title: title,
      body_html: full_body,
      mood: nil,
      music: nil,
      tags: [],
      published_at: Parser.parse_datetime(get_val(map, "post_date")),
      was_draft: is_published == "false" || is_published == "FALSE"
    }
  end

  defp get_val(map, key) do
    val = Map.get(map, key)
    if is_binary(val) && String.trim(val) != "", do: String.trim(val), else: nil
  end

  defp strip_bom(<<0xEF, 0xBB, 0xBF, rest::binary>>), do: rest
  defp strip_bom(data), do: data
end
