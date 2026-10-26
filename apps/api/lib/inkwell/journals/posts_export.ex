defmodule Inkwell.Journals.PostsExport do
  @moduledoc """
  The Posts page as a spreadsheet: one row per entry the writer has, with the
  same filters and order as the page, as CSV (opens in Excel, Numbers, Google
  Sheets and LibreOffice). A writer's own data only; nothing here is public.
  """

  import Ecto.Query
  alias Inkwell.{Repo, Reads, Stamps}
  alias Inkwell.Journals

  @max_rows 5000
  @words_per_minute 230

  @headers [
    "Title",
    "Opening lines",
    "Kind",
    "Status",
    "Who can read it",
    "Date (UTC)",
    "Created (UTC)",
    "Last edited (UTC)",
    "Scheduled for (UTC)",
    "Category",
    "Series",
    "Part",
    "Tags",
    "Words",
    "Minutes to read",
    "Reads",
    "Inks",
    "Stamps",
    "Footnotes",
    "Reprints",
    "Content warning",
    "Imported from",
    "Link"
  ]

  def max_rows, do: @max_rows
  def headers, do: @headers

  @doc """
  `{csv_iodata, row_count}` for `user` with the Posts page filters in `opts`
  (`status`, `privacy`, `category`, `series_id`, `tag`, `search`, `sort`).
  Starts with a UTF-8 byte order mark so Excel reads accents and emoji.
  """
  def build(user, opts \\ []) do
    entries =
      Journals.own_entries_query(user.id, opts)
      |> limit(@max_rows)
      |> preload([:series, :custom_filter])
      |> Repo.all()

    ids = Enum.map(entries, & &1.id)
    comments = Journals.count_comments_for_entries(ids)
    reads = Reads.counts_for_entries(ids)
    stamps = Stamps.summaries(ids)

    rows =
      Enum.map(entries, fn e ->
        row(e, user, %{
          comments: Map.get(comments, e.id, 0),
          reads: Map.get(reads, e.id, 0),
          stamps: get_in(stamps, [e.id, :count]) || 0
        })
      end)

    csv = NimbleCSV.RFC4180.dump_to_iodata([@headers | rows])
    {["﻿", csv], length(rows)}
  end

  defp row(e, user, counts) do
    words = e.word_count || 0

    [
      text(e.title),
      text(opening(e.excerpt)),
      if(e.kind == "sticky", do: "Sticky", else: "Entry"),
      status(e),
      audience(e),
      datetime(e.published_at),
      datetime(e.inserted_at),
      datetime(e.updated_at),
      if(e.status == :draft, do: datetime(e.scheduled_at), else: ""),
      category(e.category),
      text(e.series && e.series.title),
      if(e.series_id && e.series_order, do: e.series_order, else: ""),
      text(Enum.join(e.tags || [], ", ")),
      words,
      if(words > 0, do: max(1, round(words / @words_per_minute)), else: 0),
      counts.reads,
      e.ink_count || 0,
      counts.stamps,
      counts.comments,
      e.reprint_count || 0,
      text(content_warning(e)),
      imported_from(e.imported_from),
      link(e, user)
    ]
    |> Enum.map(&cell/1)
  end

  defp status(%{status: :published}), do: "Published"
  defp status(%{status: :hidden}), do: "Hidden by moderation"
  defp status(%{status: :draft, scheduled_at: %DateTime{}}), do: "Scheduled"
  defp status(%{status: :draft}), do: "Draft"
  defp status(_), do: ""

  defp audience(%{privacy: privacy} = e) do
    case to_string(privacy) do
      "public" -> "Public"
      "friends_only" -> "Pen Pals only"
      "private" -> "Only me"
      "circle" -> "Circle members"
      "paid" -> "Paid subscribers"
      "custom" ->
        case e.custom_filter do
          %{name: name} when is_binary(name) -> text("List: " <> name)
          _ -> "A custom list"
        end
      other -> other
    end
  end

  defp content_warning(%{content_warning: cw}) when is_binary(cw) and cw != "", do: cw
  defp content_warning(%{sensitive: true}), do: "Yes"
  defp content_warning(_), do: ""

  @categories %{
    "creative_writing" => "Creative Writing",
    "film_tv" => "Film & TV",
    "news_politics" => "News & Politics"
  }

  defp category(nil), do: ""

  defp category(value) do
    key = to_string(value)
    Map.get_lazy(@categories, key, fn -> key |> String.replace("_", " ") |> String.capitalize() end)
  end

  @origins %{
    "livejournal" => "LiveJournal",
    "dreamwidth" => "Dreamwidth",
    "wordpress" => "WordPress",
    "medium" => "Medium",
    "substack" => "Substack"
  }

  defp imported_from(nil), do: ""
  defp imported_from(origin), do: Map.get(@origins, origin, origin)

  # A writer can open their own entry at its address whatever its audience.
  defp link(%{status: :published, slug: slug}, %{username: username})
       when is_binary(slug) and slug != "" do
    "#{Inkwell.Instance.frontend_url()}/#{username}/#{slug}"
  end

  defp link(_, _), do: ""

  defp opening(nil), do: ""

  defp opening(text) do
    text = text |> InkwellWeb.FederationController.decode_html_entities() |> String.trim()
    if String.length(text) > 200, do: String.slice(text, 0, 199) <> "…", else: text
  end

  defp text(nil), do: ""
  defp text(value), do: value |> to_string() |> InkwellWeb.FederationController.decode_html_entities()

  defp datetime(nil), do: ""
  defp datetime(%DateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  defp datetime(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")

  # A spreadsheet runs a cell that starts with = + - @ as a formula, so a
  # title like "=HYPERLINK(...)" would do something when opened. Writers'
  # text gets a leading apostrophe, which spreadsheets hide.
  defp cell(value) when is_binary(value) do
    if value =~ ~r/\A[=+\-@\t\r]/, do: "'" <> value, else: value
  end

  defp cell(value) when is_integer(value), do: Integer.to_string(value)
  defp cell(value), do: to_string(value)
end
