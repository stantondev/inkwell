defmodule Inkwell.Import.Parsers.Livejournal do
  @moduledoc """
  Parser for LiveJournal and Dreamwidth backups:

    * **"Export Journal" XML** (livejournal.com/export.bml, dreamwidth.org/export):
      one file per month, root `<livejournal>` with an `<entry>` per post
      (`itemid`, `eventtime`, `subject`, `event`, `security`, `allowmask`,
      `current_mood`, `current_music`).
    * **ljdump** backups: one file per entry (`L-123`), root `<event>`, with
      `<props>` holding `taglist`, `current_mood`, `current_music` and
      `opt_preformatted`.

  Several files arrive as a ZIP (the upload form packs multiple files into
  one). Read with regular expressions rather than an XML parser on purpose:
  old LJ exports are often not well-formed XML (stray control characters,
  bad entities), and one bad month shouldn't sink the whole archive.
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.{LivejournalComments, LivejournalMarkup, Parser}

  @impl true
  def parse(data) when is_binary(data) do
    files =
      if zip?(data) do
        unzip_xml(data)
      else
        [{"upload", data}]
      end

    files = Enum.map(files, fn {name, content} -> {name, to_utf8(content)} end)
    comments = LivejournalComments.from_files(files)

    entries =
      files
      |> Enum.flat_map(fn {_name, content} -> parse_file(content) end)
      |> Enum.uniq_by(fn e -> {e[:source_id], e[:published_at], e[:title]} end)
      |> Enum.map(fn e -> Map.put(e, :comments, Map.get(comments, e[:source_id], [])) end)
      |> Enum.sort_by(fn e -> e[:published_at] || ~U[1970-01-01 00:00:00Z] end, DateTime)

    case entries do
      [] -> {:error, "No LiveJournal or Dreamwidth entries found. Upload the XML files from “Export Journal” (one per month) or an ljdump folder."}
      _ -> {:ok, entries}
    end
  end

  @doc "Whether `data` looks like an LJ/DW export or ljdump file (used by auto-detect)."
  def looks_like?(data) when is_binary(data) do
    head = binary_part(data, 0, min(byte_size(data), 4000))

    Regex.match?(~r/<livejournal>/i, head) or
      (Regex.match?(~r/<event>/i, head) and Regex.match?(~r/<eventtime>/i, head))
  end

  def looks_like?(_), do: false

  # ── Files ─────────────────────────────────────────────────────────────────

  defp zip?(<<"PK", 3, 4, _::binary>>), do: true
  defp zip?(_), do: false

  defp unzip_xml(data) do
    case :zip.unzip(data, [:memory]) do
      {:ok, files} ->
        files
        |> Enum.map(fn {name, content} -> {to_string(name), content} end)
        |> Enum.reject(fn {name, _} -> String.contains?(name, "__MACOSX") end)
        |> Enum.filter(fn {name, content} ->
          base = Path.basename(name)
          String.ends_with?(String.downcase(base), ".xml") or String.starts_with?(base, "L-") or
            String.starts_with?(base, "C-") or looks_like?(content)
        end)

      _ ->
        []
    end
  end

  defp parse_file(content) do
    site = if Regex.match?(~r/dreamwidth/i, binary_part(content, 0, min(byte_size(content), 2000))), do: :dreamwidth, else: :livejournal

    cond do
      Regex.match?(~r/<livejournal[\s>]/i, content) ->
        Regex.scan(~r/<entry>(.*?)<\/entry>/s, content, capture: :all_but_first)
        |> Enum.map(fn [block] -> build(block, site) end)
        |> Enum.reject(&is_nil/1)

      # ljdump: the whole file is one <event>…</event>, with a nested <event> body.
      match = Regex.run(~r/\A\s*(?:<\?xml[^>]*\?>)?\s*<event>(.*)<\/event>\s*\z/s, content, capture: :all_but_first) ->
        [inner] = match
        List.wrap(build(inner, site))

      true ->
        []
    end
  end

  defp to_utf8(content) do
    if String.valid?(content) do
      content
    else
      # Old Windows exports: treat invalid bytes as Latin-1 rather than failing.
      content |> :binary.bin_to_list() |> Enum.map(&<<&1::utf8>>) |> IO.iodata_to_binary()
    end
  end

  # ── One entry ─────────────────────────────────────────────────────────────

  defp build(block, site) do
    props = field(block, "props") || ""
    preformatted? = (field(props, "opt_preformatted") || "") in ["1", "true"]

    body =
      block
      |> body_field()
      |> LivejournalMarkup.xml_text()
      |> LivejournalMarkup.to_html(site: site, preformatted: preformatted?)

    if body do
      %{
        title: clean_text(field(block, "subject")),
        body_html: body,
        published_at: Parser.parse_datetime(field(block, "eventtime") || field(block, "logtime")),
        mood: clean_text(field(props, "current_mood") || field(block, "current_mood")),
        music: clean_text(field(props, "current_music") || field(block, "current_music")),
        tags: tags(field(props, "taglist")),
        privacy: LivejournalMarkup.privacy(String.downcase(field(block, "security") || "public"), field(block, "allowmask")),
        source_id: field(block, "itemid"),
        origin: Atom.to_string(site)
      }
    end
  end

  # The body is `<event>`. In ljdump files it sits next to `<props>` inside
  # the outer <event>, so take the first one that isn't the props block.
  defp body_field(block) do
    block
    |> String.replace(~r/<props>.*?<\/props>/s, "")
    |> field("event")
  end

  defp field(text, name) do
    case Regex.run(~r/<#{name}(?:\s[^>]*)?>(.*?)<\/#{name}>/s, text, capture: :all_but_first) do
      [value] -> value
      _ -> nil
    end
  end

  defp clean_text(nil), do: nil

  defp clean_text(raw) do
    text =
      raw
      |> LivejournalMarkup.xml_text()
      |> then(&Regex.replace(~r/<[^>]+>/, &1, ""))
      |> String.trim()

    if text == "", do: nil, else: String.slice(text, 0, 500)
  end

  defp tags(nil), do: []

  defp tags(raw) do
    raw
    |> LivejournalMarkup.xml_text()
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.take(20)
  end
end
