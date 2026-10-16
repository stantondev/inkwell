defmodule Inkwell.ProfileHome do
  @moduledoc """
  The arrangement of a writer's profile page ("home"), stored as
  `users.profile_home` (jsonb).

  A home is a list of **sections** stacked down the page. A section holds one
  to four **columns** side by side (each a share of a 12-column grid), and
  each column holds a stack of **blocks** (the profile card, journal entries,
  guestbook, pen pals…) that take their natural height. On phones every
  section becomes one column, read section by section, column by column, so a
  writer arranges the page once.

      %{
        "version" => 1,
        "width" => "standard" | "narrow",
        "sections" => [
          %{"id" => "s-main", "style" => "columns",
            "columns" => [
              %{"id" => "c-main", "span" => 9, "blocks" => [%{"id" => "b-entries", "type" => "entries", "config" => %{}}]},
              %{"id" => "c-side", "span" => 3, "blocks" => [...]}
            ]}
        ],
        "stickers" => []
      }

  Section styles: `"columns"` (side by side), `"flow"` (one column whose
  blocks pour into 2–3 newspaper columns on wide screens), `"tiles"` (a grid
  of fixed-size tiles, each block with a `"size" => %{"w", "h"}`; reserved for
  the page builder).

  Until 2026-10-16 the page was one of four fixed layouts (`profile_layout`)
  plus a widget order (`profile_widgets`). `from_legacy/1` turns those into a
  home that renders the same page, and stays in use while Settings → Customize
  still edits layout and order: changing either regenerates the home.

  Every value from a client goes through `normalize/1`; anything unknown is
  dropped rather than rejected, and the profile card and entries are always
  kept so nobody can lose the parts of their page that make it theirs.
  """

  alias Inkwell.SelfHosted

  @version 1

  # Blocks that appear at most once on a page.
  @singletons ~w[profile_card entries pinned top_pals tags series music guestbook support newsletter custom_html rss now]
  # Blocks a page may hold several of. Everything after "divider" is content
  # the writer puts on the page themselves (Phase 1, 2026-10-16).
  @repeatables ~w[divider note photo quote countdown links]
  @block_types @singletons ++ @repeatables

  @section_styles ~w[columns flow tiles]
  @widths ~w[standard narrow]
  @entry_displays ~w[cards full preview magazine]
  @entry_limits [3, 6, 9, 12]
  @note_styles ~w[card sticky index letter]
  @sticky_colors ~w[yellow pink blue green lilac peach]
  @photo_styles ~w[plain polaroid taped]
  @divider_styles ~w[line wavy stars stitch]
  @uuid ~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  @max_sections 40
  @max_columns 4
  @max_blocks 80

  # The order widgets had before anyone customised it (see the profile page's
  # old `defaultOrder`; "about" and "entries" were never widgets there and the
  # paused writer-subscription card always rendered nothing).
  @default_widget_order ~w[top_pals tags support newsletter series guestbook music custom_html]

  @id_format ~r/^[a-z0-9][a-z0-9_-]{0,39}$/

  def version, do: @version
  def block_types, do: @block_types

  @doc """
  The home to render for this user: what they saved, cleaned, or, if they
  have never saved one, the page their old settings describe.
  """
  def for_user(user) do
    case user.profile_home do
      %{} = stored when map_size(stored) > 0 ->
        case normalize(stored) do
          {:ok, home} -> home
          {:error, _} -> from_legacy(user)
        end

      _ ->
        from_legacy(user)
    end
  end

  @doc """
  The home matching the fixed layouts (classic, wide, minimal, magazine) and
  widget order of the old customiser. Layout and order were Plus features, so
  anyone without Plus gets the classic page in the default order, which is
  what they were shown.
  """
  def from_legacy(user) do
    plus? = SelfHosted.effective_tier(user) == "plus"
    widgets = if plus?, do: user.profile_widgets || %{}, else: %{}
    layout = if plus?, do: user.profile_layout || "classic", else: "classic"

    hidden = MapSet.new(list_of_strings(widgets["hidden"]))

    order =
      case list_of_strings(widgets["order"]) do
        [] -> @default_widget_order
        saved -> saved ++ Enum.reject(@default_widget_order, &(&1 in saved))
      end

    side =
      order
      |> Enum.filter(&(&1 in @default_widget_order))
      |> Enum.reject(&MapSet.member?(hidden, &1))
      |> Enum.uniq()
      |> Enum.map(&block/1)
      |> Kernel.++([block("rss")])

    top = [
      single("s-profile", block("profile_card")),
      single("s-divider", block("divider", "b-divider")),
      single("s-pinned", block("pinned"))
    ]

    entries = block("entries", "b-entries", if(layout == "magazine", do: %{"display" => "magazine"}, else: %{}))

    rest =
      case layout do
        "minimal" ->
          [single("s-entries", entries), single("s-divider-2", block("divider", "b-divider-2"))] ++
            Enum.map(side, fn b -> single("s-" <> String.replace_prefix(b["id"], "b-", ""), b) end)

        l when l in ["wide", "magazine"] ->
          [
            single("s-entries", entries),
            single("s-divider-2", block("divider", "b-divider-2")),
            %{"id" => "s-widgets", "style" => "flow", "columns" => [column("c-widgets", 12, side)]}
          ]

        _classic ->
          [
            %{
              "id" => "s-main",
              "style" => "columns",
              "columns" => [column("c-main", 9, [entries]), column("c-side", 3, side)]
            }
          ]
      end

    %{
      "version" => @version,
      "width" => if(layout == "minimal", do: "narrow", else: "standard"),
      "sections" => top ++ rest,
      "stickers" => []
    }
  end

  @doc """
  Cleans a home sent by a client or read from the database. Unknown block
  types, extra keys, duplicate ids and second copies of single blocks are
  dropped; spans are clamped; the profile card and entries are put back if
  missing. Returns `{:error, reason}` only when the value isn't a home at all.
  """
  def normalize(home), do: normalize(home, [])

  @doc """
  Like `normalize/1`; with `owner_id:`, photos must be images that user
  uploaded (anything else is dropped, so a page can't show someone else's
  picture by its id).
  """
  def normalize(%{"sections" => sections} = home, opts) when is_list(sections) do
    {sections, _seen} =
      sections
      |> Enum.take(@max_sections)
      |> Enum.map_reduce(%{ids: MapSet.new(), types: MapSet.new(), count: 0}, &normalize_section/2)

    sections = Enum.reject(sections, &(&1 == nil))
    sections = sections |> ensure_block("profile_card", :first) |> ensure_block("entries", :last)
    sections = Enum.map(sections, &prune_empty_columns/1) |> Enum.reject(&(&1["columns"] == []))
    sections = if owner = opts[:owner_id], do: keep_own_photos(sections, owner), else: sections

    {:ok,
     %{
       "version" => @version,
       "width" => if(home["width"] in @widths, do: home["width"], else: "standard"),
       "sections" => sections,
       "stickers" => normalize_stickers(home["stickers"], sections, opts)
     }}
  end

  def normalize(%{} = home, _opts) when map_size(home) == 0, do: {:error, :empty}
  def normalize(_, _opts), do: {:error, :not_a_home}

  @doc """
  The words and links a writer put on their page themselves (notes, quotes,
  "Currently", countdowns, links), for the spam checker: a page is somewhere
  to put a pitch, like a bio.
  """
  def writing(%{"sections" => sections}) when is_list(sections) do
    blocks = for %{"columns" => cols} <- sections, is_list(cols), %{"blocks" => bs} <- cols, is_list(bs), b <- bs, do: b

    Enum.reduce(blocks, {[], []}, fn
      %{"type" => t, "config" => c}, {texts, links} when is_map(c) ->
        items = if is_list(c["items"]), do: Enum.filter(c["items"], &is_map/1), else: []

        new_texts =
          [c["title"], c["body"], c["text"], c["cite"], c["caption"], c["label"]] ++
            Enum.flat_map(items, &[&1["label"], &1["value"]])

        new_links = if t == "links", do: Enum.map(items, & &1["url"]), else: []
        {texts ++ Enum.filter(new_texts, &(is_binary(&1) and &1 != "")), links ++ Enum.filter(new_links, &is_binary/1)}

      _, acc ->
        acc
    end)
  end

  def writing(_), do: {[], []}

  @doc "Ids of the uploaded images a home shows (photo blocks), for orphan cleanup."
  def image_ids(%{"sections" => sections}) when is_list(sections) do
    for %{"columns" => cols} <- sections, is_list(cols),
        %{"blocks" => blocks} <- cols, is_list(blocks),
        %{"type" => "photo", "config" => %{"image_id" => id}} <- blocks,
        is_binary(id),
        do: id
  end

  def image_ids(_), do: []

  # ── Stickers ───────────────────────────────────────────────────────────────
  #
  # Decorations pinned to a block: %{"id", "key", "anchor" (block id),
  # "edge" ("top" | "bottom" | "free"), "x" (% across the block, centre),
  # "y" (px from that edge for top/bottom; % down for free), "rotate"
  # (degrees), "scale"}. Near or past a card's top or bottom edge they're
  # measured from that edge (so they stay put when the card grows); anywhere
  # else on the card they're "free", placed by % of its size.
  # Keys mirror apps/web/src/lib/stickers.tsx.
  @sticker_keys ~w[stamp postmark airmail washi-dots washi-plain paperclip daisy leaf inkblot heart star ticket]
  @plus_sticker_keys ~w[wax-seal photo-corner rose moon par-avion butterfly]
  @max_stickers 30

  def sticker_keys, do: @sticker_keys
  def plus_sticker_keys, do: @plus_sticker_keys

  defp normalize_stickers(list, sections, opts) when is_list(list) do
    types = for s <- sections, c <- s["columns"], b <- c["blocks"], into: %{}, do: {b["id"], b["type"]}
    allowed = if Keyword.get(opts, :plus, true), do: @sticker_keys ++ @plus_sticker_keys, else: @sticker_keys

    {stickers, _} =
      list
      |> Enum.filter(&is_map/1)
      |> Enum.reduce({[], MapSet.new()}, fn st, {acc, seen} ->
        anchor_type = Map.get(types, st["anchor"])

        cond do
          length(acc) >= @max_stickers -> {acc, seen}
          anchor_type == nil -> {acc, seen}
          st["key"] not in allowed -> {acc, seen}
          true ->
            id =
              if is_binary(st["id"]) and Regex.match?(@id_format, st["id"]) and not MapSet.member?(seen, st["id"]),
                do: st["id"],
                else: unique_id("k", seen)

            edge =
              cond do
                st["edge"] == "free" -> "free"
                st["edge"] == "bottom" -> "bottom"
                true -> "top"
              end

            y =
              case edge do
                "free" -> num(st["y"], 0, 100, 50)
                "top" -> num(st["y"], -48, 32, 0)
                "bottom" -> num(st["y"], -32, 48, 0)
              end

            sticker = %{
              "id" => id,
              "key" => st["key"],
              "anchor" => st["anchor"],
              "edge" => edge,
              "x" => num(st["x"], -10, 110, 90),
              "y" => y,
              "rotate" => num(st["rotate"], -180, 180, 0) |> round(),
              "scale" => num(st["scale"], 0.4, 2.5, 1.0)
            }

            {[sticker | acc], MapSet.put(seen, id)}
        end
      end)

    Enum.reverse(stickers)
  end

  defp normalize_stickers(_list, _sections, _opts), do: []

  # A number clamped to a range and rounded to one decimal (two for scale-sized ranges).
  defp num(v, lo, hi, _default) when is_number(v) do
    v = v |> max(lo) |> min(hi)
    if hi - lo <= 3, do: Float.round(v / 1, 2), else: Float.round(v / 1, 1)
  end

  defp num(_v, _lo, _hi, default), do: default

  @doc "Every block id in page order (sections, then columns, then blocks)."
  def block_ids(%{"sections" => sections}) do
    for s <- sections, c <- s["columns"], b <- c["blocks"], do: b["id"]
  end

  @doc """
  Writes a home for every account that doesn't have one yet, from its old
  layout settings. Safe to run repeatedly. Returns the number written.
  """
  def backfill(batch \\ 200) do
    import Ecto.Query
    alias Inkwell.{Repo, Accounts.User}

    Stream.unfold(nil, fn after_id ->
      users =
        from(u in User,
          where: is_nil(u.profile_home),
          order_by: u.id,
          limit: ^batch
        )
        |> then(fn q -> if after_id, do: where(q, [u], u.id > ^after_id), else: q end)
        |> Repo.all()

      case users do
        [] -> nil
        list -> {list, List.last(list).id}
      end
    end)
    |> Enum.reduce(0, fn users, acc ->
      Enum.each(users, fn u ->
        from(x in User, where: x.id == ^u.id and is_nil(x.profile_home))
        |> Repo.update_all(set: [profile_home: from_legacy(u)])
      end)

      acc + length(users)
    end)
  end

  # ── Normalising ───────────────────────────────────────────────────────────

  defp normalize_section(%{} = s, seen) do
    style = if s["style"] in @section_styles, do: s["style"], else: "columns"
    {id, seen} = take_id(s["id"], "s", seen)

    raw_columns =
      case s["columns"] do
        list when is_list(list) -> list
        _ -> []
      end

    raw_columns =
      case style do
        "columns" -> Enum.take(raw_columns, @max_columns)
        _ -> Enum.take(raw_columns, 1)
      end

    {columns, seen} = Enum.map_reduce(raw_columns, seen, &normalize_column(&1, &2, style))
    columns = Enum.reject(columns, &(&1 == nil))
    columns = if style == "columns", do: fit_spans(columns), else: Enum.map(columns, &Map.put(&1, "span", 12))

    {%{"id" => id, "style" => style, "columns" => columns}, seen}
  end

  defp normalize_section(_, seen), do: {nil, seen}

  defp normalize_column(%{} = c, seen, style) do
    {id, seen} = take_id(c["id"], "c", seen)
    span = clamp(c["span"], 1, 12, 12)

    raw_blocks =
      case c["blocks"] do
        list when is_list(list) -> list
        _ -> []
      end

    {blocks, seen} = Enum.map_reduce(raw_blocks, seen, &normalize_block(&1, &2, style))
    {%{"id" => id, "span" => span, "blocks" => Enum.reject(blocks, &(&1 == nil))}, seen}
  end

  defp normalize_column(_, seen, _style), do: {nil, seen}

  defp normalize_block(%{"type" => type} = b, seen, style) when type in @block_types do
    cond do
      seen.count >= @max_blocks -> {nil, seen}
      type in @singletons and MapSet.member?(seen.types, type) -> {nil, seen}
      true ->
        {id, seen} = take_id(b["id"], "b", seen)
        seen = %{seen | types: MapSet.put(seen.types, type), count: seen.count + 1}

        block =
          %{"id" => id, "type" => type, "config" => normalize_config(type, b["config"])}
          |> maybe_put_size(b["size"], style)

        {block, seen}
    end
  end

  defp normalize_block(_, seen, _style), do: {nil, seen}

  # display: how entries look here (else the writer's Entry Display setting);
  # limit: show only the latest few, with a link to the whole journal.
  defp normalize_config("entries", %{} = c) do
    %{}
    |> then(fn m -> if c["display"] in @entry_displays, do: Map.put(m, "display", c["display"]), else: m end)
    |> then(fn m -> if c["limit"] in @entry_limits, do: Map.put(m, "limit", c["limit"]), else: m end)
  end

  defp normalize_config("divider", %{"style" => st}) when st in @divider_styles, do: %{"style" => st}

  defp normalize_config("note", %{} = c) do
    %{
      "title" => text(c["title"], 80),
      "body" => text(c["body"], 2000, multiline: true),
      "style" => pick(c["style"], @note_styles, "card"),
      "color" => pick(c["color"], @sticky_colors, "yellow")
    }
  end

  defp normalize_config("photo", %{} = c) do
    %{
      "image_id" => if(is_binary(c["image_id"]) and Regex.match?(@uuid, c["image_id"]), do: c["image_id"], else: nil),
      "caption" => text(c["caption"], 200),
      "alt" => text(c["alt"], 300),
      "style" => pick(c["style"], @photo_styles, "plain")
    }
  end

  defp normalize_config("quote", %{} = c),
    do: %{"text" => text(c["text"], 500, multiline: true), "cite" => text(c["cite"], 100)}

  defp normalize_config("countdown", %{} = c) do
    date =
      case c["date"] do
        d when is_binary(d) ->
          case Date.from_iso8601(d) do
            {:ok, date} -> Date.to_iso8601(date)
            _ -> nil
          end

        _ ->
          nil
      end

    %{"label" => text(c["label"], 80), "date" => date}
  end

  defp normalize_config("now", %{"items" => items}) when is_list(items) do
    items =
      items
      |> Enum.filter(&is_map/1)
      |> Enum.map(fn i -> %{"label" => text(i["label"], 30), "value" => text(i["value"], 120)} end)
      |> Enum.reject(&(&1["label"] == "" and &1["value"] == ""))
      |> Enum.take(8)

    %{"items" => items}
  end

  defp normalize_config("links", %{} = c) do
    items =
      case c["items"] do
        list when is_list(list) ->
          list
          |> Enum.filter(&is_map/1)
          |> Enum.map(fn i -> %{"label" => text(i["label"], 60), "url" => web_url(i["url"])} end)
          |> Enum.reject(&is_nil(&1["url"]))
          |> Enum.take(12)

        _ ->
          []
      end

    %{"title" => text(c["title"], 60), "items" => items}
  end

  defp normalize_config(type, _config) when type in ~w[note photo quote countdown now links],
    do: normalize_config(type, %{"items" => []})

  defp normalize_config(_type, _config), do: %{}

  # Plain text only: tags are shown as typed (the page escapes them), control
  # characters dropped, trimmed to a limit in characters.
  defp text(value, max, opts \\ [])

  defp text(value, max, opts) when is_binary(value) do
    value =
      if opts[:multiline],
        do: value |> String.replace(~r/\r\n?/, "\n") |> String.replace(~r/[\x00-\x09\x0B-\x1F\x7F]/u, "") |> String.replace(~r/\n{3,}/, "\n\n"),
        else: String.replace(value, ~r/[\x00-\x1F\x7F]/u, " ")

    value |> String.trim() |> String.slice(0, max)
  end

  defp text(_value, _max, _opts), do: ""

  defp pick(value, allowed, default), do: if(value in allowed, do: value, else: default)

  # http(s) links only; a bare "example.com" gets https://.
  defp web_url(url) when is_binary(url) do
    url = String.trim(url)
    url = if url != "" and not String.contains?(url, "://"), do: "https://" <> url, else: url

    case URI.parse(url) do
      %URI{scheme: scheme, host: host, port: port} when scheme in ["http", "https"] and is_binary(host) ->
        ok? =
          Regex.match?(~r/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i, host) and port in [80, 443] and
            String.length(url) <= 500 and not String.contains?(url, [" ", "<", ">", "\""])

        if ok?, do: url, else: nil

      _ ->
        nil
    end
  end

  defp web_url(_), do: nil

  defp keep_own_photos(sections, owner_id) do
    ids = image_ids(%{"sections" => sections})

    owned =
      if ids == [] do
        MapSet.new()
      else
        import Ecto.Query

        from(i in Inkwell.Journals.EntryImage, where: i.id in ^ids and i.user_id == ^owner_id, select: i.id)
        |> Inkwell.Repo.all()
        |> MapSet.new()
      end

    map_blocks(sections, fn
      %{"type" => "photo", "config" => %{"image_id" => id} = c} = b when is_binary(id) ->
        if MapSet.member?(owned, id), do: b, else: %{b | "config" => %{c | "image_id" => nil}}

      b ->
        b
    end)
  end

  defp map_blocks(sections, fun) do
    Enum.map(sections, fn s ->
      %{s | "columns" => Enum.map(s["columns"], fn c -> %{c | "blocks" => Enum.map(c["blocks"], fun)} end)}
    end)
  end

  defp maybe_put_size(block, %{"w" => w, "h" => h}, "tiles"),
    do: Map.put(block, "size", %{"w" => clamp(w, 1, 4, 1), "h" => clamp(h, 1, 4, 1)})

  defp maybe_put_size(block, _size, "tiles"), do: Map.put(block, "size", %{"w" => 1, "h" => 1})
  defp maybe_put_size(block, _size, _style), do: block

  # Ids are kept when well formed and unused, otherwise replaced, so two
  # blocks can never share one (stickers and the phone order point at them).
  defp take_id(id, prefix, seen) do
    id =
      if is_binary(id) and Regex.match?(@id_format, id) and not MapSet.member?(seen.ids, id),
        do: id,
        else: unique_id(prefix, seen.ids)

    {id, %{seen | ids: MapSet.put(seen.ids, id)}}
  end

  defp unique_id(prefix, taken) do
    id = prefix <> "-" <> (:crypto.strong_rand_bytes(5) |> Base.encode32(case: :lower, padding: false))
    if MapSet.member?(taken, id), do: unique_id(prefix, taken), else: id
  end

  # Columns in a section share 12 grid units; a section that claims more is
  # scaled back, keeping each column at least one unit.
  defp fit_spans(columns) do
    total = Enum.reduce(columns, 0, &(&1["span"] + &2))

    if total <= 12 do
      columns
    else
      Enum.map(columns, fn c -> %{c | "span" => max(1, div(c["span"] * 12, total))} end)
    end
  end

  defp prune_empty_columns(section) do
    # An empty column in a columns section is a deliberate gap; elsewhere it's nothing.
    if section["style"] == "columns" and Enum.any?(section["columns"], &(&1["blocks"] != [])),
      do: section,
      else: %{section | "columns" => Enum.reject(section["columns"], &(&1["blocks"] == []))}
  end

  defp ensure_block(sections, type, where) do
    present? = Enum.any?(sections, fn s -> Enum.any?(s["columns"], fn c -> Enum.any?(c["blocks"], &(&1["type"] == type)) end) end)

    if present? do
      sections
    else
      taken = sections |> Enum.flat_map(fn s -> [s["id"] | Enum.flat_map(s["columns"], fn c -> [c["id"] | Enum.map(c["blocks"], & &1["id"])] end)] end) |> MapSet.new()
      bid = if MapSet.member?(taken, "b-" <> type), do: unique_id("b", taken), else: "b-" <> type
      sid = if MapSet.member?(taken, "s-" <> type), do: unique_id("s", taken), else: "s-" <> type
      cid = if MapSet.member?(taken, "c-" <> type), do: unique_id("c", taken), else: "c-" <> type
      section = %{"id" => sid, "style" => "columns", "columns" => [column(cid, 12, [%{"id" => bid, "type" => type, "config" => %{}}])]}
      if where == :first, do: [section | sections], else: sections ++ [section]
    end
  end

  # ── Building ──────────────────────────────────────────────────────────────

  defp block(type, id \\ nil, config \\ %{}),
    do: %{"id" => id || "b-" <> String.replace(type, "_", "-"), "type" => type, "config" => config}

  defp column(id, span, blocks), do: %{"id" => id, "span" => span, "blocks" => blocks}

  defp single(id, block),
    do: %{"id" => id, "style" => "columns", "columns" => [column("c" <> String.replace_prefix(id, "s", ""), 12, [block])]}

  defp clamp(n, lo, hi, _default) when is_integer(n), do: n |> max(lo) |> min(hi)
  defp clamp(_, _lo, _hi, default), do: default

  defp list_of_strings(list) when is_list(list), do: Enum.filter(list, &is_binary/1)
  defp list_of_strings(_), do: []
end
