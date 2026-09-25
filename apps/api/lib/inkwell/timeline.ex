defmodule Inkwell.Timeline do
  @moduledoc """
  Pages through a timeline merged from several sources (Inkwell entries,
  fediverse posts, reprints), each already sorted the same way.

  Feed and Explore used to take the first 40 of each source, merge and cut a
  page from that, so they ran dry after two pages (Explore never showed more
  than the newest 40 Inkwell entries) and skipped entries once one source was
  past its 40. Page N needs the first N × per_page items *of every source*,
  after that source's filters: the true top N × per_page of the merge is
  always among them.

  Filters that can't run in SQL (muted words, fediverse quality and blocks)
  go in `keep?`, so they no longer leave a page short, which the web app
  read as "that's the end".
  """

  # Highest page served. Page N reads N × per_page rows from every source.
  @max_page 50
  # Batches fetched per source before giving up on a filter that rejects
  # almost everything (e.g. a very broad muted word).
  @max_rounds 8

  def max_page, do: @max_page

  @doc """
  The first `needed` items of one source that pass `keep?`.

  `fetch` is `fn offset, limit -> [item] end`, sorted like the timeline.
  Returns `{items, exhausted?}`; `items` may be longer than `needed`.
  """
  def take(fetch, keep?, needed) when needed > 0 do
    do_take(fetch, keep?, needed, 0, [], 0)
  end

  defp do_take(fetch, keep?, needed, offset, acc, round) do
    raw = fetch.(offset, needed)
    acc = acc ++ Enum.filter(raw, keep?)

    cond do
      length(raw) < needed -> {acc, true}
      length(acc) >= needed -> {acc, false}
      round + 1 >= @max_rounds -> {acc, false}
      true -> do_take(fetch, keep?, needed, offset + needed, acc, round + 1)
    end
  end

  @doc """
  Merges `{items, exhausted?}` sources with `sorter` and cuts out `page`.
  Returns `{page_items, has_more?}`.
  """
  def page(sources, sorter, page, per_page) do
    merged = sources |> Enum.flat_map(&elem(&1, 0)) |> sorter.()
    items = merged |> Enum.drop((page - 1) * per_page) |> Enum.take(per_page)

    has_more =
      page < @max_page and
        (length(merged) > page * per_page or Enum.any?(sources, fn {_, done} -> not done end))

    {items, has_more}
  end
end
