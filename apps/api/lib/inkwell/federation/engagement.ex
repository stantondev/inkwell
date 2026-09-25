defmodule Inkwell.Federation.Engagement do
  @moduledoc """
  Replies, boosts and favourites on fediverse posts: read from the post's home
  server, kept fresh while people are reading, and combined with what Inkwell
  members did for display.

  ## Where the counts come from

  1. Mastodon's public status API (`/api/v1/statuses/:id`), for Mastodon-style
     post ids. It gives exact replies/boosts/favourites. Mastodon leaves the
     reply total out of its ActivityPub object, so this is the only place it
     can be read (until 2026-09-25 every Mastodon post showed 0 comments).
  2. Misskey's `notes/show` for Misskey-family servers (`/notes/:id`).
  3. The ActivityPub object's `replies` / `likes` / `shares` totals, signed
     when the server requires authorized fetch.

  A total the server doesn't publish stays as it was; it is never set to 0.

  ## When

  `ttl_seconds/2`, by the post's age: every 15 minutes for a post under two
  hours old, then less often. Posts are refreshed when they're on screen
  (`refresh_stale/1`, from Feed, Explore and the post page) and, for accounts
  members follow, on a schedule (`RefreshEngagementWorker`). An Inkwell stamp
  or reprint schedules a refresh a minute later (`refresh_soon/1`), so the
  home server's count catches up with it.

  ## Display (`summaries/2`)

  - comments: every comment stored here (fediverse replies, nested ones, and
    members' footnotes), plus direct replies the home server knows about that
    haven't been fetched yet.
  - inks: Inkwell inks + the home server's favourites.
  - reprints: Inkwell reprints + the home server's boosts.

  Stamps go out as Likes and reprints as Announces, so the home server counts
  them too. A stamp or reprint made before the last refresh is taken back out
  of the home server's number, so nothing is counted twice.
  """

  import Ecto.Query

  alias Inkwell.Federation.{Http, RemoteEntry}
  alias Inkwell.Federation.Workers.FetchRepliesWorker
  alias Inkwell.{Inks, Repo, Reprints}
  alias Inkwell.Journals.Comment
  alias Inkwell.Reprints.Reprint
  alias Inkwell.Stamps.Stamp
  alias Inkwell.Workers.RefreshEngagementWorker

  require Logger

  @minute 60
  @hour 60 * @minute
  @day 24 * @hour

  # ── Display ────────────────────────────────────────────────────────────

  @doc """
  The counts to show for a list of remote entries, keyed by id:
  `comment_count`, `ink_count`, `reprint_count`, `likes_count`,
  `boosts_count` (the last two are the fediverse's share, without Inkwell's),
  `my_ink`, `my_reprint`.
  """
  def summaries(entries, viewer_id \\ nil)
  def summaries([], _viewer_id), do: %{}

  def summaries(entries, viewer_id) do
    ids = Enum.map(entries, & &1.id)

    comments = comment_counts(ids)
    inks = Inks.count_inks_for_remote_entries(ids)
    # Only announced reprints reach the home server (quote reprints don't).
    reprints = member_counts(Reprint, ids, &where(&1, [x], not is_nil(x.ap_announce_id)))
    stamps = member_counts(Stamp, ids)

    my_inks = if viewer_id, do: Inks.get_user_inks_for_remote_entries(viewer_id, ids), else: MapSet.new()
    my_reprints = if viewer_id, do: Reprints.get_user_reprints_for_remote_entries(viewer_id, ids), else: MapSet.new()

    Map.new(entries, fn e ->
      {total, direct} = Map.get(comments, e.id, {0, 0})
      {reprinted, reprints_counted} = Map.get(reprints, e.id, {0, 0})
      {_stamped, stamps_counted} = Map.get(stamps, e.id, {0, 0})

      likes = max((e.likes_count || 0) - stamps_counted, 0)
      boosts = max((e.boosts_count || 0) - reprints_counted, 0)

      {e.id,
       %{
         comment_count: total + max((e.reply_count || 0) - direct, 0),
         ink_count: Map.get(inks, e.id, 0) + likes,
         reprint_count: reprinted + boosts,
         likes_count: likes,
         boosts_count: boosts,
         my_ink: MapSet.member?(my_inks, e.id),
         my_reprint: MapSet.member?(my_reprints, e.id)
       }}
    end)
  end

  @doc "`summaries/2` for one entry."
  def summary(%RemoteEntry{} = entry, viewer_id \\ nil) do
    summaries([entry], viewer_id) |> Map.fetch!(entry.id)
  end

  # %{id => {all comments, top-level comments}}
  defp comment_counts(ids) do
    from(c in Comment,
      where: c.remote_entry_id in ^ids,
      group_by: c.remote_entry_id,
      select: {c.remote_entry_id, {count(c.id), filter(count(c.id), is_nil(c.parent_comment_id))}}
    )
    |> Repo.all()
    |> Map.new()
  end

  # %{id => {all by members, those already counted by the home server}}.
  # "Already counted" = sent to it (`sent`) and made before the last refresh.
  defp member_counts(schema, ids, sent \\ & &1) do
    all =
      from(x in schema,
        where: x.remote_entry_id in ^ids and not is_nil(x.user_id),
        group_by: x.remote_entry_id,
        select: {x.remote_entry_id, count(x.id)}
      )
      |> Repo.all()
      |> Map.new()

    counted =
      from(x in schema,
        join: e in RemoteEntry,
        on: e.id == x.remote_entry_id,
        where: x.remote_entry_id in ^ids and not is_nil(x.user_id),
        where: x.inserted_at <= e.engagement_refreshed_at,
        group_by: x.remote_entry_id,
        select: {x.remote_entry_id, count(x.id)}
      )
      |> sent.()
      |> Repo.all()
      |> Map.new()

    Map.new(all, fn {id, n} -> {id, {n, Map.get(counted, id, 0)}} end)
  end

  # ── Freshness ──────────────────────────────────────────────────────────

  @doc "How long a post's counts stay fresh, by its age."
  def ttl_seconds(published_at, now \\ DateTime.utc_now())
  def ttl_seconds(nil, _now), do: @day

  def ttl_seconds(published_at, now) do
    age = DateTime.diff(now, published_at, :second)

    cond do
      age < 2 * @hour -> 15 * @minute
      age < 12 * @hour -> @hour
      age < 3 * @day -> 6 * @hour
      age < 14 * @day -> @day
      true -> 7 * @day
    end
  end

  def stale?(entry, now \\ DateTime.utc_now())
  def stale?(%RemoteEntry{engagement_refreshed_at: nil}, _now), do: true

  def stale?(%RemoteEntry{} = e, now) do
    DateTime.diff(now, e.engagement_refreshed_at, :second) >= ttl_seconds(e.published_at, now)
  end

  @doc """
  Queues a refresh for the entries on screen whose counts are stale. The next
  view shows the new counts. Never blocks the request.
  """
  def refresh_stale(entries) do
    now = DateTime.utc_now()

    ids =
      entries
      |> Enum.filter(&match?(%RemoteEntry{}, &1))
      |> Enum.filter(&stale?(&1, now))
      |> Enum.map(& &1.id)
      |> Enum.sort()

    if ids != [] and enabled?() do
      %{"ids" => ids}
      |> RefreshEngagementWorker.new(unique: [period: 120, keys: [:ids]])
      |> Oban.insert()
    end

    :ok
  end

  @doc """
  After a member stamps or reprints a fediverse post: re-read its counts a
  minute later, once our Like/Announce has reached the home server.
  """
  def refresh_soon(remote_entry_id) do
    if enabled?() do
      %{"id" => remote_entry_id, "force" => true}
      |> RefreshEngagementWorker.new(
        schedule_in: 60,
        unique: [period: 60, keys: [:id], states: [:scheduled, :available]]
      )
      |> Oban.insert()
    end

    :ok
  end

  # Off in tests: jobs run inline there and would call real servers.
  defp enabled?, do: Application.get_env(:inkwell, :refresh_fediverse_counts, true)

  # ── Refreshing ─────────────────────────────────────────────────────────

  @doc """
  Re-reads one post's counts from its home server. Claims the post first
  (sets `engagement_refreshed_at`), so two jobs never fetch the same post and
  a server that's down isn't asked again before the post's TTL.
  `force: true` skips the staleness check (after a member's stamp/reprint).
  Returns `:refreshed`, `:skipped` or `:error`.
  """
  def refresh(%RemoteEntry{} = entry, opts \\ []) do
    now = DateTime.utc_now()

    if claim(entry, now, Keyword.get(opts, :force, false)) do
      case fetch_counts(entry.ap_id) do
        {:ok, counts} ->
          apply_counts(entry, counts)
          maybe_fetch_thread(entry, counts, now)
          :refreshed

        {:error, reason} ->
          Logger.debug("Engagement: couldn't refresh #{entry.ap_id}: #{inspect(reason)}")
          :error
      end
    else
      :skipped
    end
  end

  defp claim(entry, now, force) do
    query = from(e in RemoteEntry, where: e.id == ^entry.id)

    query =
      if force do
        query
      else
        threshold = DateTime.add(now, -ttl_seconds(entry.published_at, now), :second)
        where(query, [e], is_nil(e.engagement_refreshed_at) or e.engagement_refreshed_at <= ^threshold)
      end

    {n, _} = Repo.update_all(query, set: [engagement_refreshed_at: now])
    n == 1
  end

  @doc """
  Stores the counts the home server gave. `nil` = not published, left alone.
  These are the home server's own numbers, so they may go down (an unfavourite).
  """
  def apply_counts(%RemoteEntry{id: id}, counts) do
    set =
      [
        reply_count: counts[:replies],
        boosts_count: counts[:boosts],
        likes_count: counts[:likes]
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    if set != [] do
      from(e in RemoteEntry, where: e.id == ^id) |> Repo.update_all(set: set)
    end

    :ok
  end

  # New replies on the home server: fetch the thread now, so they're there
  # when someone opens the comments. Also re-reads a thread with replies once
  # it's older than the post's TTL (replies to replies don't change the count).
  defp maybe_fetch_thread(entry, %{replies: replies}, now) when is_integer(replies) and replies > 0 do
    new_replies = replies > (entry.reply_count || 0)

    thread_stale =
      is_nil(entry.replies_fetched_at) or
        DateTime.diff(now, entry.replies_fetched_at, :second) >= ttl_seconds(entry.published_at, now)

    if new_replies or thread_stale do
      %{remote_entry_id: entry.id} |> FetchRepliesWorker.new() |> Oban.insert()
    end
  end

  defp maybe_fetch_thread(_entry, _counts, _now), do: :ok

  # ── Reading counts from the home server ────────────────────────────────

  @doc """
  `{:ok, %{replies: n | nil, boosts: n | nil, likes: n | nil}}` or an error.
  """
  def fetch_counts(ap_id) when is_binary(ap_id) do
    case fetch_from_api(ap_id) do
      {:ok, counts} -> {:ok, counts}
      :miss -> fetch_from_object(ap_id)
    end
  end

  def fetch_counts(_), do: {:error, :no_ap_id}

  defp fetch_from_api(ap_id) do
    case api_ref(ap_id) do
      {:mastodon, host, id} ->
        case Http.get_json("https://#{host}/api/v1/statuses/#{id}") do
          # The id is the home server's own, but check the answer is this post.
          {:ok, %{"uri" => ^ap_id} = status} -> {:ok, from_mastodon_status(status)}
          _ -> :miss
        end

      {:misskey, host, id} ->
        case Http.post_json("https://#{host}/api/notes/show", %{"noteId" => id}) do
          {:ok, %{"id" => ^id} = note} -> {:ok, from_misskey_note(note)}
          _ -> :miss
        end

      nil ->
        :miss
    end
  end

  defp fetch_from_object(ap_id) do
    case Http.get_object(ap_id) do
      {:ok, object} -> {:ok, object |> from_ap_object() |> follow_linked_totals(object)}
      error -> error
    end
  end

  # Some servers (NodeBB) link a collection instead of embedding it; its own
  # document has the total. Only links on the post's own server are followed.
  defp follow_linked_totals(counts, object) do
    host = URI.parse(object["id"] || "").host

    Enum.reduce([replies: "replies", boosts: "shares", likes: "likes"], counts, fn {key, field}, acc ->
      with nil <- acc[key],
           url when is_binary(url) <- object[field],
           %URI{host: ^host} when is_binary(host) <- URI.parse(url),
           {:ok, collection} <- Http.get_object(url) do
        Map.put(acc, key, collection_total(collection))
      else
        _ -> acc
      end
    end)
  end

  @doc """
  Which public API can answer for a post id:
  - Mastodon: `https://host/users/name/statuses/123` and the newer
    `https://host/ap/users/456/statuses/123`
  - Misskey family: `https://host/notes/abc123`
  """
  def api_ref(ap_id) when is_binary(ap_id) do
    case URI.parse(ap_id) do
      %URI{scheme: "https", host: host, path: path, query: nil} when is_binary(host) and is_binary(path) ->
        cond do
          m = Regex.run(~r{\A/(?:ap/)?users/[^/]+/statuses/(\d+)\z}, path) -> {:mastodon, host, Enum.at(m, 1)}
          m = Regex.run(~r{\A/notes/([0-9a-zA-Z]+)\z}, path) -> {:misskey, host, Enum.at(m, 1)}
          true -> nil
        end

      _ ->
        nil
    end
  end

  def api_ref(_), do: nil

  @doc "Counts from a Mastodon API status."
  def from_mastodon_status(status) do
    %{
      replies: count(status["replies_count"]),
      boosts: count(status["reblogs_count"]),
      likes: count(status["favourites_count"])
    }
  end

  @doc "Counts from a Misskey note. Reactions are its favourites."
  def from_misskey_note(note) do
    likes =
      case note do
        %{"reactionCount" => n} when is_integer(n) -> n
        %{"reactions" => %{} = r} -> r |> Map.values() |> Enum.filter(&is_integer/1) |> Enum.sum()
        _ -> nil
      end

    %{replies: count(note["repliesCount"]), boosts: count(note["renoteCount"]), likes: likes}
  end

  @doc "Counts from an ActivityPub object's collections; `nil` where there's no total."
  def from_ap_object(object) when is_map(object) do
    %{
      replies: collection_total(object["replies"]),
      boosts: collection_total(object["shares"]),
      likes: collection_total(object["likes"])
    }
  end

  def from_ap_object(_), do: %{replies: nil, boosts: nil, likes: nil}

  @doc """
  Counts to store when a post first arrives (inbox, outbox, relay): only the
  totals the object has, as `reply_count` / `boosts_count` / `likes_count`.
  """
  def ingest_attrs(object) do
    counts = from_ap_object(object)

    [reply_count: counts.replies, boosts_count: counts.boosts, likes_count: counts.likes]
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
  end

  defp collection_total(%{"totalItems" => n}) when is_integer(n) and n >= 0, do: n
  defp collection_total(_), do: nil

  defp count(n) when is_integer(n) and n >= 0, do: n
  defp count(_), do: nil
end
