defmodule Inkwell.Federation.ContentQuality do
  @moduledoc """
  Content quality checks for remote (fediverse) entries.
  Used by both RelayContentWorker (at ingest time) and ExploreController (at read time)
  to filter out mojibake, bot content, and low-quality posts.
  """

  @doc """
  Returns true if a remote entry's body_html appears to contain garbled/mojibake text.
  Checks for patterns like scattered Ã, â€, Ð/Ñ sequences that indicate encoding issues.
  """
  def has_mojibake?(body_html) when is_binary(body_html) do
    plain = strip_html(body_html)
    len = String.length(plain)

    if len < 20 do
      false
    else
      mojibake_count =
        count_occurrences(plain, "Ã") +
        count_occurrences(plain, "â€") +
        count_occurrences(plain, "Â") +
        count_cyrillic_mojibake(plain)

      # If >15% of the text is mojibake markers, it's garbled
      mojibake_count * 3 > len
    end
  end

  def has_mojibake?(_), do: false

  @doc """
  Returns true if the remote entry has meaningful readable content.
  Filters out extremely short posts and link-only content.
  Entries with a title (Articles) bypass the word count check.
  """
  def has_quality_content?(remote_entry) do
    has_title = is_binary(remote_entry.title) and remote_entry.title != ""
    body = remote_entry.body_html || ""
    plain = strip_html(body)
    word_count = plain |> String.split(~r/\s+/, trim: true) |> length()

    cond do
      # Entries with titles are likely articles — keep them
      has_title -> true
      # Too short
      word_count < 15 -> false
      # Link-only check
      link_only?(body, plain) -> false
      true -> true
    end
  end

  @doc """
  Filters a list of remote entries, removing mojibake and low-quality content.
  """
  def filter_remote_entries(entries) do
    Enum.reject(entries, fn re ->
      has_mojibake?(re.body_html) or not has_quality_content?(re)
    end)
  end

  # ── Private helpers ─────────────────────────────────────────────

  defp link_only?(html, plain) do
    full_len = String.length(String.trim(plain))

    if full_len < 10 do
      false
    else
      without_links = Regex.replace(~r/<a[^>]*>.*?<\/a>/s, html, "") |> strip_html() |> String.trim()
      String.length(without_links) / full_len < 0.2
    end
  end

  defp strip_html(html) when is_binary(html) do
    html
    |> String.replace(~r/<br\s*\/?>/, " ")
    |> String.replace(~r/<[^>]+>/, "")
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&#39;", "'")
    |> String.replace("&nbsp;", " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp strip_html(_), do: ""

  defp count_occurrences(string, pattern) do
    string
    |> String.split(pattern)
    |> length()
    |> Kernel.-(1)
    |> max(0)
  end

  defp count_cyrillic_mojibake(text) do
    matches = Regex.scan(~r/[ÐÑ][^\s]{0,2}[ÐÑ]/, text)
    length(matches)
  end
end
