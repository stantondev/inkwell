defmodule Inkwell.Gazette.Editions do
  @moduledoc """
  Numbered issues of the Gazette: a morning and an evening edition each day.

  An edition is a fixed page, not a feed. When it's published we pick the
  stories trending right now, rank them by how many different people shared
  them, keep at most three per publisher so one outlet can't fill the paper,
  and store a snapshot. Readers get the same paper until the next edition,
  and old editions stay readable in the archive.

  Ranking, in full: people who shared the link today, plus a quarter of the
  week's sharers, halved if the article is more than two days old. That is
  the whole formula, and the page says so.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Gazette.{Edition, Story}

  @max_stories 30
  @per_publisher 3
  # Only stories seen on a trending list within this window.
  @fresh_hours 18
  # Articles older than this never make the paper, even if they trend.
  @max_article_age_days 7
  # The sources are English-language servers; other languages trend there
  # rarely and read as noise on an English front page.
  @languages ["en"]
  @keep_editions_days 180

  def max_per_publisher, do: @per_publisher

  @doc "Slot for a publish time: before 17:00 UTC is the morning edition."
  def slot_for(%DateTime{hour: h}) when h < 17, do: "morning"
  def slot_for(_), do: "evening"

  @doc """
  Builds and stores the next edition from the stories trending now.
  Returns `{:ok, edition}`, or `{:error, :no_stories}` when nothing is fresh
  (the previous edition then stays up).
  """
  def publish(now \\ DateTime.utc_now()) do
    previous = latest()
    previous_lead = previous && lead_url(previous)
    previous_urls = if previous, do: MapSet.new(story_urls(previous)), else: MapSet.new()

    ranked =
      candidates(now)
      |> Enum.map(&{&1, score(&1, now)})
      |> Enum.sort_by(fn {s, sc} -> {-sc, DateTime.to_unix(s.first_seen_at, :microsecond)} end)
      |> cap_per_publisher()
      |> Enum.take(@max_stories)
      |> avoid_repeat_lead(previous_lead)

    if ranked == [] do
      {:error, :no_stories}
    else
      items =
        Enum.map(ranked, fn {story, sc} ->
          snapshot(story, sc, MapSet.member?(previous_urls, story.url))
        end)

      number = (Repo.one(from e in Edition, select: max(e.number)) || 0) + 1

      %Edition{}
      |> Edition.changeset(%{
        number: number,
        slot: slot_for(now),
        published_at: now,
        stories: %{"items" => items},
        story_count: length(items)
      })
      |> Repo.insert()
    end
  end

  @doc "Publishes an edition if none exists yet (first run after deploy)."
  def ensure_one do
    if Repo.exists?(Edition), do: :ok, else: publish()
  end

  def latest do
    Repo.one(from e in Edition, order_by: [desc: e.number], limit: 1)
  end

  def get_by_number(number) when is_integer(number) do
    Repo.get_by(Edition, number: number)
  end

  def get_by_number(_), do: nil

  @doc "The numbers either side of an edition, for page-to-page navigation."
  def neighbours(%Edition{number: n}) do
    prev = Repo.one(from e in Edition, where: e.number < ^n, select: max(e.number))
    next = Repo.one(from e in Edition, where: e.number > ^n, select: min(e.number))
    {prev, next}
  end

  @doc "Past editions, newest first."
  def list(page \\ 1, per_page \\ 30) do
    offset = (max(page, 1) - 1) * per_page

    editions =
      Repo.all(
        from e in Edition,
          order_by: [desc: e.number],
          limit: ^per_page,
          offset: ^offset
      )

    total = Repo.aggregate(Edition, :count)
    {editions, total}
  end

  def prune do
    cutoff = DateTime.add(DateTime.utc_now(), -@keep_editions_days, :day)
    {count, _} = Repo.delete_all(from e in Edition, where: e.published_at < ^cutoff)
    {:ok, count}
  end

  def items(%Edition{stories: %{"items" => items}}) when is_list(items), do: items
  def items(_), do: []

  @doc false
  def score(%Story{} = s, now) do
    base = (s.shares_today || 0) + 0.25 * (s.shares_week || 0)

    if s.article_published_at && DateTime.diff(now, s.article_published_at, :hour) > 48,
      do: base / 2,
      else: base
  end

  # ── private ──────────────────────────────────────────────────────────

  defp candidates(now) do
    fresh = DateTime.add(now, -@fresh_hours, :hour)
    oldest_article = DateTime.add(now, -@max_article_age_days, :day)

    Story
    |> where([s], s.last_seen_at >= ^fresh)
    |> where([s], is_nil(s.article_published_at) or s.article_published_at >= ^oldest_article)
    |> where([s], is_nil(s.language) or s.language in ^@languages)
    |> Repo.all()
  end

  defp cap_per_publisher(ranked) do
    {kept, _counts} =
      Enum.reduce(ranked, {[], %{}}, fn {story, _} = item, {acc, counts} ->
        key = publisher_key(story)
        n = Map.get(counts, key, 0)

        if n < @per_publisher,
          do: {[item | acc], Map.put(counts, key, n + 1)},
          else: {acc, counts}
      end)

    Enum.reverse(kept)
  end

  defp publisher_key(%Story{provider_name: name, url: url}) do
    (name && String.downcase(name)) ||
      case URI.parse(url) do
        %URI{host: h} -> h
        _ -> url
      end
  end

  # Don't lead two editions running with the same story when there's
  # another strong one (at least 60% as shared) to put on top.
  defp avoid_repeat_lead([{lead, lead_score} | rest] = ranked, previous_lead)
       when is_binary(previous_lead) do
    case rest do
      [{_, next_score} = next | tail] when lead.url == previous_lead and next_score >= lead_score * 0.6 ->
        [next, {lead, lead_score} | tail]

      _ ->
        ranked
    end
  end

  defp avoid_repeat_lead(ranked, _), do: ranked

  defp lead_url(edition) do
    case items(edition) do
      [%{"url" => url} | _] -> url
      _ -> nil
    end
  end

  defp story_urls(edition), do: edition |> items() |> Enum.map(& &1["url"])

  defp snapshot(%Story{} = s, score, continuing) do
    %{
      "id" => s.id,
      "url" => s.url,
      "title" => s.title,
      "description" => s.description,
      "image_url" => s.image_url,
      "image_description" => s.image_description,
      "blurhash" => s.blurhash,
      "provider_name" => s.provider_name,
      "author_name" => s.author_name,
      "article_published_at" => s.article_published_at && DateTime.to_iso8601(s.article_published_at),
      "opinion" => s.opinion,
      "topics" => s.topics,
      "shares_today" => s.shares_today,
      "shares_week" => s.shares_week,
      "trending_on" => s.trending_on,
      "score" => Float.round(score / 1, 1),
      "continuing" => continuing
    }
  end
end
