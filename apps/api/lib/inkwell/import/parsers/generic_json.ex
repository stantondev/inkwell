defmodule Inkwell.Import.Parsers.GenericJson do
  @moduledoc """
  Parser for generic JSON files. Accepts a JSON array of objects or
  a wrapper like {"entries": [...]} or {"posts": [...]}.
  Flexible field mapping for common blog export formats.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  @impl true
  def parse(data) when is_binary(data) do
    case Jason.decode(data) do
      {:ok, entries} when is_list(entries) ->
        {:ok, Enum.filter(entries, &is_map/1) |> Enum.map(&parse_entry/1)}

      {:ok, %{} = root} ->
        entries =
          Map.get(root, "entries") ||
            Map.get(root, "posts") ||
            Map.get(root, "articles") ||
            Map.get(root, "items") ||
            []

        if is_list(entries) do
          {:ok, Enum.filter(entries, &is_map/1) |> Enum.map(&parse_entry/1)}
        else
          {:error, "Could not find an array of entries in the JSON object"}
        end

      {:ok, _} ->
        {:error, "Invalid JSON: expected an array or object with entries/posts key"}

      {:error, %Jason.DecodeError{} = e} ->
        {:error, "Invalid JSON: #{Exception.message(e)}"}
    end
  end

  defp parse_entry(entry) do
    body_raw =
      find_field(entry, ~w(body_html body content text html description)) || ""

    %{
      title: find_field(entry, ~w(title name heading subject)),
      body_html: Parser.ensure_html(body_raw),
      mood: find_field(entry, ~w(mood feeling)),
      music: find_field(entry, ~w(music song track audio)),
      tags: parse_tags(entry),
      published_at: parse_date(entry),
      was_draft: parse_draft_status(entry)
    }
  end

  defp find_field(map, keys) do
    Enum.find_value(keys, fn key ->
      val = Map.get(map, key)
      if is_binary(val) && val != "", do: val, else: nil
    end)
  end

  defp parse_tags(entry) do
    raw =
      Map.get(entry, "tags") ||
        Map.get(entry, "categories") ||
        Map.get(entry, "labels") ||
        Map.get(entry, "keywords")

    case raw do
      tags when is_list(tags) -> Enum.map(tags, &to_string/1)
      str when is_binary(str) -> String.split(str, ~r/[,;]/) |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
      _ -> []
    end
  end

  defp parse_date(entry) do
    raw =
      find_field(entry, ~w(published_at date created_at published publish_date post_date created))

    Parser.parse_datetime(raw)
  end

  defp parse_draft_status(entry) do
    status = Map.get(entry, "status") || Map.get(entry, "state") || ""
    is_published = Map.get(entry, "is_published")

    cond do
      is_published == false -> true
      is_published == "false" -> true
      String.downcase(to_string(status)) == "draft" -> true
      true -> false
    end
  end
end
