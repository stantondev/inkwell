defmodule Inkwell.Import.Parsers.GenericCsv do
  @moduledoc """
  Parser for generic CSV files with case-insensitive column mapping.
  Expects a header row with columns like title, body, date, tags, etc.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  NimbleCSV.define(Inkwell.Import.Parsers.GenericCsv.CSV, separator: ",", escape: "\"")

  @impl true
  def parse(data) when is_binary(data) do
    # Strip BOM if present
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
    # Zip headers with row values
    map =
      headers
      |> Enum.zip(row)
      |> Map.new()

    body_raw =
      find_col(map, ~w(body body_html content text html)) || ""

    %{
      title: find_col(map, ~w(title name heading subject)),
      body_html: Parser.ensure_html(body_raw),
      mood: find_col(map, ~w(mood feeling)),
      music: find_col(map, ~w(music song track)),
      tags: parse_tags(map),
      published_at: parse_date(map),
      was_draft: parse_draft(map)
    }
  end

  defp find_col(map, keys) do
    Enum.find_value(keys, fn key ->
      val = Map.get(map, key)
      if is_binary(val) && String.trim(val) != "", do: String.trim(val), else: nil
    end)
  end

  defp parse_tags(map) do
    raw = find_col(map, ~w(tags categories labels keywords))

    case raw do
      nil -> []
      str -> String.split(str, ~r/[,;|]/) |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
    end
  end

  defp parse_date(map) do
    raw = find_col(map, ~w(date published_at published_date created_at post_date publish_date))
    Parser.parse_datetime(raw)
  end

  defp parse_draft(map) do
    status = find_col(map, ~w(status state is_published))

    case status do
      nil -> false
      s ->
        lower = String.downcase(s)
        lower == "draft" || lower == "false"
    end
  end

  defp strip_bom(<<0xEF, 0xBB, 0xBF, rest::binary>>), do: rest
  defp strip_bom(data), do: data
end
