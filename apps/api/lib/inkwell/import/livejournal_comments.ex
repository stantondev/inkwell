defmodule Inkwell.Import.LivejournalComments do
  @moduledoc """
  Comments from LiveJournal / Dreamwidth, in one shape for the importer:

      %{source_id, parent_source_id, author, subject, body_html, posted_at}

  `author` is the commenter's LJ username, or nil for anonymous comments.

  Sources:

    * LJ's comment export (`export_comments.bml`): a `comment_meta` file
      (`<usermap id='…' user='…'/>` maps poster ids to usernames) and a
      `comment_body` file (`<comment id jitemid posterid parentid state>`
      with `<subject>`, `<body>`, `<date>`). Matched to entries by `jitemid`,
      which is the entry's `<itemid>` in the journal export.
    * ljdump: one `C-<itemid>` file per entry, `<comments>` of `<comment>`
      with `<id>`, `<parentid>`, `<user>`, `<date>`, `<subject>`, `<body>`,
      `<state>`.
    * A public journal's comment JSON (see `LivejournalPublic`).

  Left out: deleted and screened comments (screened ones were only ever
  visible to the journal owner and the commenter), and anonymous comments
  that look like the era's spam (a link, a stock compliment, or the run of
  empty lines LJ left where it stripped the links).
  """

  alias Inkwell.Import.{LivejournalMarkup, Parser}

  @doc "Comments from uploaded files, as `%{entry_itemid => [comment]}`."
  def from_files(files) do
    site = if Enum.any?(files, fn {_, c} -> String.contains?(binary_part(c, 0, min(byte_size(c), 2000)), "dreamwidth") end), do: :dreamwidth, else: :livejournal

    usermap =
      files
      |> Enum.flat_map(fn {_, content} ->
        Regex.scan(~r/<usermap\s+([^>]*?)\/?>/, content, capture: :all_but_first)
        |> Enum.map(fn [attrs] -> attrs(attrs) end)
      end)
      |> Map.new(fn a -> {a["id"], a["user"]} end)

    body_comments =
      files
      |> Enum.flat_map(fn {_, content} ->
        Regex.scan(~r/<comment\s+([^>]*?[^\/])>(.*?)<\/comment>/s, content, capture: :all_but_first)
        |> Enum.map(fn [attrs, inner] ->
          a = attrs(attrs)

          {a["jitemid"],
           %{
             source_id: a["id"],
             parent_source_id: a["parentid"],
             author: Map.get(usermap, a["posterid"]),
             anonymous?: a["posterid"] in [nil, "", "0"],
             state: a["state"],
             subject: field(inner, "subject"),
             body: field(inner, "body"),
             date: field(inner, "date")
           }}
        end)
      end)

    ljdump_comments =
      files
      |> Enum.filter(fn {name, _} -> String.starts_with?(Path.basename(name), "C-") end)
      |> Enum.flat_map(fn {name, content} ->
        itemid = name |> Path.basename() |> String.replace_prefix("C-", "")

        Regex.scan(~r/<comment>(.*?)<\/comment>/s, content, capture: :all_but_first)
        |> Enum.map(fn [inner] ->
          user = field(inner, "user")

          {itemid,
           %{
             source_id: field(inner, "id"),
             parent_source_id: field(inner, "parentid"),
             author: blank_to_nil(user),
             anonymous?: blank_to_nil(user) == nil,
             state: field(inner, "state"),
             subject: field(inner, "subject"),
             body: field(inner, "body"),
             date: field(inner, "date")
           }}
        end)
      end)

    (body_comments ++ ljdump_comments)
    |> Enum.group_by(fn {itemid, _} -> itemid end, fn {_, c} -> c end)
    |> Map.new(fn {itemid, raw} -> {itemid, raw |> Enum.uniq_by(& &1.source_id) |> finalize(site, :raw)} end)
  end

  @doc """
  Clean a list of comments. `:raw` bodies are LJ source text (export files);
  `:rendered` bodies are HTML already shown on the page (public journal).
  """
  def finalize(comments, site, kind) do
    comments
    |> Enum.reject(fn c -> c.state in ["D", "S"] end)
    |> Enum.map(fn c ->
      body =
        case kind do
          :raw -> c.body |> LivejournalMarkup.xml_text() |> LivejournalMarkup.to_html(site: site)
          :rendered -> c.body && LivejournalMarkup.to_html(c.body, site: site, preformatted: true)
        end

      subject = clean_subject(c.subject)
      body = if subject && body, do: "<p><strong>#{subject}</strong></p>\n" <> body, else: body

      %{
        source_id: to_string(c.source_id),
        parent_source_id: blank_to_nil(to_string(c.parent_source_id || "")) |> then(&if(&1 == "0", do: nil, else: &1)),
        author: blank_to_nil(c.author),
        anonymous?: Map.get(c, :anonymous?, blank_to_nil(c.author) == nil),
        posted_at: posted_at(c.date),
        body_html: body,
        url: Map.get(c, :url),
        site: site
      }
    end)
    |> Enum.reject(fn c -> is_nil(c.body_html) end)
    |> Enum.reject(fn c -> c.anonymous? and spam?(c.body_html) end)
    # Trailing blank lines are just LJ's leftovers.
    |> Enum.map(fn c -> %{c | body_html: Regex.replace(~r/(\s*<br\s*\/?>)+\s*\z/i, c.body_html, "")} end)
    |> Enum.reject(fn c -> String.trim(c.body_html) == "" end)
    |> Enum.sort_by(fn c -> c.posted_at || ~U[1970-01-01 00:00:00Z] end, DateTime)
  end

  # Anonymous comment spam on 2000s LiveJournal: links, or (once LJ stripped
  # the links) a generic compliment ending in a run of empty line breaks.
  @spam_phrases ~r/very (interesting|useful|nice)|good (stuff|resources|site|info)|(nice|great|cool) (site|blog|page)|thanks? (much|for the info)|g'?night/i

  @doc false
  def spam?(html) do
    Regex.match?(~r/https?:\/\/|www\./i, html) or
      Regex.match?(@spam_phrases, html) or
      Regex.match?(~r/(<br\s*\/?>\s*){4,}\s*(<\/p>)?\s*\z/i, html)
  end

  defp posted_at(%DateTime{} = dt), do: dt
  defp posted_at(n) when is_integer(n), do: DateTime.from_unix!(n)
  defp posted_at(text) when is_binary(text), do: text |> LivejournalMarkup.xml_text() |> Parser.parse_datetime()
  defp posted_at(_), do: nil

  # "Re: …" subjects just repeat the thread; keep only ones people wrote.
  defp clean_subject(nil), do: nil

  defp clean_subject(raw) do
    text = raw |> LivejournalMarkup.xml_text() |> then(&Regex.replace(~r/<[^>]+>/, &1, "")) |> String.trim()

    cond do
      text == "" -> nil
      String.match?(text, ~r/^re:/i) -> nil
      true -> text |> String.slice(0, 200) |> html_escape()
    end
  end

  defp html_escape(text) do
    text |> String.replace("&", "&amp;") |> String.replace("<", "&lt;") |> String.replace(">", "&gt;")
  end

  defp attrs(text) do
    Regex.scan(~r/(\w+)\s*=\s*(['"])(.*?)\2/, text, capture: :all_but_first)
    |> Map.new(fn [k, _q, v] -> {k, LivejournalMarkup.xml_text(v)} end)
  end

  defp field(text, name) do
    case Regex.run(~r/<#{name}(?:\s[^>]*)?>(.*?)<\/#{name}>/s, text, capture: :all_but_first) do
      [value] -> value
      _ -> nil
    end
  end

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(s) when is_binary(s), do: if(String.trim(s) == "", do: nil, else: String.trim(s))
end
