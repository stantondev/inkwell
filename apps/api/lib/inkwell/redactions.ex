defmodule Inkwell.Redactions do
  @moduledoc """
  Keyword-based content filtering ("Redactions").

  Users can configure a list of words in their settings. Entries containing
  any of those words in title, body, or tags are hidden from Feed, Explore,
  and profile listings. Authors always see their own entries.

  No database tables — words are stored in the user's `settings` JSONB field
  under the key `"redacted_words"` as a list of lowercase strings.
  """

  @doc """
  Extracts the redacted words list from a user struct.
  Returns an empty list if none configured.
  """
  def get_redacted_words(%{settings: %{"redacted_words" => words}}) when is_list(words), do: words
  def get_redacted_words(_user), do: []

  @doc """
  Returns true if the entry matches any of the redacted words.
  Checks title, body (HTML stripped), and tags via substring matching.
  """
  def matches_redaction?(_entry, []), do: false
  def matches_redaction?(entry, words) do
    text = entry_text(entry)
    Enum.any?(words, fn word -> String.contains?(text, word) end)
  end

  @doc """
  Filters a list of entries, removing any that match the redacted words.
  Returns the list unchanged if words is empty.
  """
  def filter_entries(entries, []), do: entries
  def filter_entries(entries, words) do
    Enum.reject(entries, fn entry -> matches_redaction?(entry, words) end)
  end

  # Build a single downcased string from entry fields for matching
  defp entry_text(entry) do
    title = (Map.get(entry, :title) || "") |> String.downcase()
    body = (Map.get(entry, :body_html) || "") |> strip_html() |> String.downcase()
    tags = (Map.get(entry, :tags) || []) |> Enum.join(" ") |> String.downcase()
    "#{title} #{body} #{tags}"
  end

  defp strip_html(html) do
    html
    |> String.replace(~r/<[^>]*>/, " ")
    |> String.replace(~r/&amp;/, "&")
    |> String.replace(~r/&lt;/, "<")
    |> String.replace(~r/&gt;/, ">")
    |> String.replace(~r/&quot;/, "\"")
    |> String.replace(~r/&#39;/, "'")
    |> String.replace(~r/&[^;]+;/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end
end
