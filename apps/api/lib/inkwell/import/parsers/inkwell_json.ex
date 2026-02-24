defmodule Inkwell.Import.Parsers.InkwellJson do
  @moduledoc """
  Parser for Inkwell's own JSON export format.
  Expects the format produced by ExportDataWorker.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  @impl true
  def parse(data) when is_binary(data) do
    # Handle gzipped data (magic bytes \x1f\x8b)
    data =
      case data do
        <<0x1F, 0x8B, _rest::binary>> -> :zlib.gunzip(data)
        _ -> data
      end

    case Jason.decode(data) do
      {:ok, %{"entries" => entries} = root} ->
        drafts = Map.get(root, "drafts", [])

        published =
          entries
          |> Enum.filter(&is_map/1)
          |> Enum.map(&parse_entry(&1, false))

        draft_entries =
          drafts
          |> Enum.filter(&is_map/1)
          |> Enum.map(&parse_entry(&1, true))

        {:ok, published ++ draft_entries}

      {:ok, entries} when is_list(entries) ->
        {:ok, Enum.filter(entries, &is_map/1) |> Enum.map(&parse_entry(&1, false))}

      {:ok, _} ->
        {:error, "Invalid Inkwell JSON: expected an object with 'entries' key or an array"}

      {:error, %Jason.DecodeError{} = e} ->
        {:error, "Invalid JSON: #{Exception.message(e)}"}
    end
  rescue
    e in ErlangError ->
      {:error, "Failed to decompress file: #{inspect(e)}"}
  end

  defp parse_entry(entry, is_draft) do
    %{
      title: entry["title"],
      body_html: entry["body_html"],
      mood: entry["mood"],
      music: entry["music"],
      tags: parse_tags(entry["tags"]),
      published_at: Parser.parse_datetime(entry["published_at"]),
      was_draft: is_draft
    }
  end

  defp parse_tags(tags) when is_list(tags), do: Enum.map(tags, &to_string/1)
  defp parse_tags(_), do: []
end
