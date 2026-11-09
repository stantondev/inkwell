defmodule Inkwell.Transparency.Participation do
  @moduledoc """
  The public "who's writing here" numbers on /transparency, month by month:
  how many people wrote, how many of them had written before, how many posts
  got a response, how many people responded to someone, and how many
  first-time writers came back within 30 days.

  Asked for by @stoicalgeezer (2026-11-08): registrations say less about a
  community than whether writers are heard and return.

  Rules, kept deliberately plain because they're printed on the page:

    * Finished months only, once every post in them has had its week to get a
      response. "Came back" stays nil until the month's last first-timers have
      had their 30 days.
    * Counts, never targets or anything about one person. These are small
      numbers, and a target would invite thin replies.
    * Admins' own posts and responses aren't counted (a post answered by an
      admin is still answered). Nor is anyone suspended, limited or held back
      by the spam checker, so a past month can shrink when spam is caught late.
    * Private, imported and quote-reprint posts aren't counted, nor posts dated
      before the account existed.

  Cached for an hour with the rest of the page; a failure shows the last good
  numbers rather than breaking it.
  """

  alias Inkwell.{Accounts, Journals, Repo}
  alias Inkwell.Federation.InstanceActor

  require Logger

  @months 6
  @response_days 7
  @return_days 30
  @cache_key {__MODULE__, :months}
  @cache_ttl_seconds 3600

  @member """
  u.username <> $3 AND u.blocked_at IS NULL
  AND (u.moderation_state IS NULL OR u.moderation_state <> 'limited')
  AND NOT (u.id = ANY($1::uuid[])) AND NOT (u.id = ANY($2::uuid[]))
  """

  @month_sql """
  WITH p AS (
    SELECT e.id, e.user_id, e.published_at
    FROM entries e JOIN users u ON u.id = e.user_id
    WHERE e.status = 'published' AND e.privacy <> 'private'
      AND coalesce(e.source, '') <> 'import' AND e.imported_from IS NULL
      AND e.quoted_entry_id IS NULL AND e.quoted_remote_entry_id IS NULL
      AND e.published_at >= u.inserted_at - interval '1 day'
      AND #{@member}
  ), firsts AS (
    SELECT user_id, min(published_at) AS first_at FROM p GROUP BY user_id
  ), m AS (
    SELECT p.id, p.user_id, f.first_at,
      EXISTS (SELECT 1 FROM comments c WHERE c.entry_id = p.id AND c.user_id IS DISTINCT FROM p.user_id
              AND c.inserted_at < p.published_at + make_interval(days => #{@response_days})) AS footnote,
      EXISTS (SELECT 1 FROM inks i WHERE i.entry_id = p.id
              AND i.inserted_at < p.published_at + make_interval(days => #{@response_days})) AS ink,
      EXISTS (SELECT 1 FROM stamps s WHERE s.entry_id = p.id
              AND s.inserted_at < p.published_at + make_interval(days => #{@response_days})) AS stamp
    FROM p JOIN firsts f ON f.user_id = p.user_id
    WHERE p.published_at >= $4::timestamp AND p.published_at < $5::timestamp
  ), newcomers AS (
    SELECT user_id, first_at FROM firsts WHERE first_at >= $4::timestamp AND first_at < $5::timestamp
  ), responders AS (
    SELECT c.user_id AS uid FROM comments c LEFT JOIN entries e ON e.id = c.entry_id
      WHERE c.user_id IS NOT NULL AND c.inserted_at >= $4::timestamp AND c.inserted_at < $5::timestamp
        AND (c.remote_entry_id IS NOT NULL OR e.user_id <> c.user_id)
    UNION
    SELECT i.user_id FROM inks i
      WHERE i.user_id IS NOT NULL AND i.inserted_at >= $4::timestamp AND i.inserted_at < $5::timestamp
    UNION
    SELECT s.user_id FROM stamps s
      WHERE s.user_id IS NOT NULL AND s.inserted_at >= $4::timestamp AND s.inserted_at < $5::timestamp
    UNION
    SELECT g.author_id FROM guestbook_entries g
      WHERE g.author_id IS NOT NULL AND g.author_id <> g.profile_user_id
        AND g.inserted_at >= $4::timestamp AND g.inserted_at < $5::timestamp
  )
  SELECT
    (SELECT count(DISTINCT user_id) FROM m),
    (SELECT count(DISTINCT user_id) FROM m WHERE first_at < $4::timestamp),
    (SELECT count(*) FROM m),
    (SELECT count(*) FROM m WHERE footnote),
    (SELECT count(*) FROM m WHERE footnote OR ink OR stamp),
    (SELECT count(*) FROM responders r JOIN users u ON u.id = r.uid WHERE #{@member}),
    (SELECT count(*) FROM newcomers),
    (SELECT count(*) FROM newcomers n WHERE
       EXISTS (SELECT 1 FROM p WHERE p.user_id = n.user_id
               AND p.published_at::date > n.first_at::date
               AND p.published_at <= n.first_at + make_interval(days => #{@return_days}))
       OR EXISTS (SELECT 1 FROM comments c LEFT JOIN entries e ON e.id = c.entry_id
               WHERE c.user_id = n.user_id AND (c.remote_entry_id IS NOT NULL OR e.user_id <> c.user_id)
               AND c.inserted_at::date > n.first_at::date
               AND c.inserted_at <= n.first_at + make_interval(days => #{@return_days})))
  """

  @doc "The last finished months, newest first (cached). `[]` if they can't be worked out."
  def months do
    now = System.system_time(:second)

    case :persistent_term.get(@cache_key, nil) do
      {cached_at, value} when now - cached_at < @cache_ttl_seconds ->
        value

      cached ->
        case compute(Date.utc_today()) do
          {:ok, value} ->
            :persistent_term.put(@cache_key, {now, value})
            value

          :error ->
            case cached do
              {_, value} -> value
              _ -> []
            end
        end
    end
  end

  @doc false
  def clear_cache, do: :persistent_term.erase(@cache_key)

  @doc "The numbers as of `today`, uncached."
  def compute(%Date{} = today) do
    params = base_params()
    {:ok, today |> finished_months() |> Enum.map(&month(&1, params, today))}
  rescue
    e ->
      Logger.warning("[Transparency] participation failed: #{Exception.message(e)}")
      :error
  end

  @doc false
  # A month counts once its last post has had its week to get a response.
  def finished_months(%Date{} = today) do
    latest =
      today
      |> Date.beginning_of_month()
      |> Date.add(-1)
      |> Date.beginning_of_month()

    latest = if Date.compare(Date.add(Date.end_of_month(latest), @response_days + 1), today) == :gt, do: previous(latest), else: latest

    latest
    |> Stream.iterate(&previous/1)
    |> Enum.take(@months)
  end

  defp previous(month), do: month |> Date.add(-1) |> Date.beginning_of_month()

  defp base_params do
    admins = Accounts.list_admins() |> Enum.map(&Ecto.UUID.dump!(&1.id))
    held = Journals.showcase_excluded_user_ids() |> Repo.all() |> Enum.map(&Ecto.UUID.dump!/1)
    [admins, held, InstanceActor.username()]
  end

  defp month(%Date{} = first_day, params, today) do
    next = first_day |> Date.end_of_month() |> Date.add(1)

    %{rows: [[writers, returning, posts, footnoted, responded, responders, first_timers, came_back]]} =
      Repo.query!(@month_sql, params ++ [midnight(first_day), midnight(next)], timeout: 15_000)

    # The last first-timers of the month, who posted on its final day, have
    # until this date to come back.
    final_on = first_day |> Date.end_of_month() |> Date.add(@return_days + 1)
    final? = Date.compare(today, final_on) != :lt

    %{
      month: first_day,
      writers: writers,
      returning_writers: returning,
      posts: posts,
      posts_with_footnote: footnoted,
      posts_with_response: responded,
      people_responding: responders,
      first_time_writers: first_timers,
      came_back: if(final?, do: came_back),
      came_back_final_on: final_on
    }
  end

  defp midnight(date), do: NaiveDateTime.new!(date, ~T[00:00:00])
end
