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
  @singletons ~w[profile_card entries pinned top_pals tags series music guestbook support newsletter custom_html rss]
  # Blocks a page may hold several of.
  @repeatables ~w[divider]
  @block_types @singletons ++ @repeatables

  @section_styles ~w[columns flow tiles]
  @widths ~w[standard narrow]
  @entry_displays ~w[cards full preview magazine]

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
  def normalize(%{"sections" => sections} = home) when is_list(sections) do
    {sections, _seen} =
      sections
      |> Enum.take(@max_sections)
      |> Enum.map_reduce(%{ids: MapSet.new(), types: MapSet.new(), count: 0}, &normalize_section/2)

    sections = Enum.reject(sections, &(&1 == nil))
    sections = sections |> ensure_block("profile_card", :first) |> ensure_block("entries", :last)
    sections = Enum.map(sections, &prune_empty_columns/1) |> Enum.reject(&(&1["columns"] == []))

    {:ok,
     %{
       "version" => @version,
       "width" => if(home["width"] in @widths, do: home["width"], else: "standard"),
       "sections" => sections,
       "stickers" => []
     }}
  end

  def normalize(%{} = home) when map_size(home) == 0, do: {:error, :empty}
  def normalize(_), do: {:error, :not_a_home}

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

  defp normalize_config("entries", %{"display" => d}) when d in @entry_displays, do: %{"display" => d}
  defp normalize_config(_type, _config), do: %{}

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
