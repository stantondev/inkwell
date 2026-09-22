defmodule Inkwell.Import.LivejournalMarkup do
  @moduledoc """
  Turns LiveJournal / Dreamwidth entry text into ordinary HTML.

  LJ stores entries as the writer typed them: HTML mixed with plain line
  breaks (which LJ turned into `<br>` when showing the page, unless the
  entry was marked preformatted), plus LJ's own tags:

    * `<lj user="name">` / `<lj comm="name">` / `<user name="name">` → a link
      to that journal
    * `<lj-cut>` → dropped (its contents are kept; there's no "read more" to
      hide behind once the whole entry is on its own page)
    * `<lj-embed>`, `<lj-poll>`, `<lj-template>` → dropped (they only work on LJ)
    * `<lj-raw>` → dropped, contents kept

  The result still goes through `Inkwell.HtmlSanitizer` when the entry is
  saved, so anything unsafe is removed there.
  """

  @block_tags ~w(p div table thead tbody tfoot tr td th ul ol li blockquote pre h1 h2 h3 h4 h5 h6 hr center dl dt dd form)

  @doc "Convert LJ entry text to HTML. `site` is `:livejournal` or `:dreamwidth`."
  def to_html(text, opts \\ [])
  def to_html(nil, _opts), do: nil

  def to_html(text, opts) when is_binary(text) do
    site = Keyword.get(opts, :site, :livejournal)
    preformatted? = Keyword.get(opts, :preformatted, false)

    html =
      text
      |> String.replace("\r\n", "\n")
      |> String.replace("\r", "\n")
      |> convert_user_tags(site)
      |> strip_lj_tags()

    html = if preformatted?, do: html, else: convert_line_breaks(html)

    case String.trim(html) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  # <lj user="x">, <lj user='x' />, <lj comm="x">, <lj site="…" user="x">, DW's <user name="x">
  defp convert_user_tags(html, site) do
    Regex.replace(
      ~r/<(?:lj|user)\s+[^>]*?(?:user|comm|name)\s*=\s*["']?([A-Za-z0-9_\-]{1,30})["']?[^>]*?\/?>/i,
      html,
      fn _, name -> journal_link(name, site) end
    )
  end

  defp journal_link(name, site) do
    host =
      case site do
        :dreamwidth -> "#{String.replace(name, "_", "-")}.dreamwidth.org"
        _ -> "#{String.replace(name, "_", "-")}.livejournal.com"
      end

    ~s(<a href="https://#{host}/">#{name}</a>)
  end

  defp strip_lj_tags(html) do
    html
    # Things that only work on LJ, with everything inside them.
    |> then(&Regex.replace(~r/<lj-(?:embed|poll)\b[^>]*>.*?<\/lj-(?:embed|poll)\s*>/is, &1, ""))
    |> then(&Regex.replace(~r/<lj-(?:embed|poll|template)\b[^>]*\/?>/i, &1, ""))
    # Wrappers whose contents stay.
    |> then(&Regex.replace(~r/<\/?lj-(?:cut|raw|spoiler|like)\b[^>]*>/i, &1, ""))
    |> then(&Regex.replace(~r/<\/?cut\b[^>]*>/i, &1, ""))
  end

  # LJ showed every line break as a <br>. For plain entries, blank lines
  # become paragraphs and single breaks <br>. Entries that already contain
  # block-level HTML keep LJ's own behaviour (breaks only), minus the breaks
  # right next to block tags, which would otherwise fill tables and lists
  # with stray gaps.
  defp convert_line_breaks(html) do
    block = Enum.join(@block_tags, "|")
    block_re = ~r/<\/?(?:#{block})\b[^>]*>/i

    if Regex.match?(block_re, html) do
      html
      |> then(&Regex.replace(~r/\n*(<\/?(?:#{block})\b[^>]*>)\n*/i, &1, "\\1"))
      |> String.replace("\n", "<br>\n")
    else
      html
      |> String.split(~r/\n{2,}/)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.map_join("\n", fn para -> "<p>" <> String.replace(para, "\n", "<br>\n") <> "</p>" end)
    end
  end

  @doc "Decode XML entities and CDATA, as found in LJ export files."
  def xml_text(nil), do: nil

  def xml_text(raw) when is_binary(raw) do
    case Regex.run(~r/\A\s*<!\[CDATA\[(.*)\]\]>\s*\z/s, raw) do
      [_, inner] -> inner
      _ -> decode_entities(raw)
    end
  end

  defp decode_entities(text) do
    text
    |> then(&Regex.replace(~r/&#x([0-9a-fA-F]+);/, &1, fn whole, hex -> codepoint(whole, String.to_integer(hex, 16)) end))
    |> then(&Regex.replace(~r/&#([0-9]+);/, &1, fn whole, dec -> codepoint(whole, String.to_integer(dec)) end))
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&apos;", "'")
    |> String.replace("&amp;", "&")
  end

  defp codepoint(whole, n) do
    <<n::utf8>>
  rescue
    _ -> whole
  end

  @doc """
  LJ's `security` + `allowmask` as an Inkwell privacy, or nil for public
  (which then follows the writer's chosen default).
  """
  def privacy("private", _mask), do: "private"
  # "usemask" with any mask is friends or a custom friends group; the closest
  # thing here without the groups is friends-only.
  def privacy("usemask", _mask), do: "friends_only"
  def privacy("friends", _mask), do: "friends_only"
  def privacy(_, _), do: nil
end
