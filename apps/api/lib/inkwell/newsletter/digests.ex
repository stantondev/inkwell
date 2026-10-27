defmodule Inkwell.Newsletter.Digests do
  @moduledoc """
  Newsletter digests: instead of one email per post, a writer can gather the
  posts they mark for the newsletter into one email.

    * `"weekly"` — on a chosen weekday and hour, in the writer's time zone
    * `"count"`  — once `newsletter_digest_count` posts are waiting (3–10), and
      never more than one every 3 days; a post never waits more than 30 days
    * `"each"`   — one email per post (the original behaviour); anything still
      waiting from a digest mode goes out at the next hourly check

  A post marked for the newsletter gets `newsletter_queued_at`. A digest is a
  `newsletter_sends` row with `kind: "digest"` and the posts point at it through
  `newsletter_send_id` (the same column single sends use), so a post is waiting
  exactly while it is queued and has no send. Digests don't count against the
  monthly send limit (`Inkwell.Newsletter.count_sends_this_month/1`): they mean
  fewer emails, not more.
  """

  import Ecto.Query

  alias Inkwell.{Repo, Newsletter}
  alias Inkwell.Accounts.User
  alias Inkwell.Journals.Entry
  alias Inkwell.Newsletter.Send

  @modes ~w(each weekly count)
  @count_spacing_days 3
  @max_wait_days 30
  @send_now_spacing_hours 24

  def modes, do: @modes
  def max_wait_days, do: @max_wait_days
  def count_spacing_days, do: @count_spacing_days

  @doc "True when the writer gathers newsletter posts into digests."
  def digest_mode?(%User{newsletter_mode: mode}), do: mode in ["weekly", "count"]
  def digest_mode?(_), do: false

  def valid_timezone?(tz) when is_binary(tz) and tz != "" do
    match?({:ok, _}, DateTime.now(tz, Tz.TimeZoneDatabase))
  rescue
    _ -> false
  end

  def valid_timezone?(_), do: false

  # ── The queue ──

  @doc "Hold a published entry for the writer's next digest."
  def queue(%Entry{} = entry) do
    if is_nil(entry.newsletter_send_id) and is_nil(entry.newsletter_sent_at) do
      entry
      |> Ecto.Changeset.change(%{newsletter_queued_at: DateTime.utc_now()})
      |> Repo.update()
    else
      {:ok, entry}
    end
  end

  defp queue_query(user_id) do
    from e in Entry,
      where:
        e.user_id == ^user_id and not is_nil(e.newsletter_queued_at) and
          is_nil(e.newsletter_send_id) and e.status == :published and e.privacy == :public
  end

  @doc "Posts waiting for the writer's next digest, oldest first."
  def queued_entries(user_id) do
    queue_query(user_id)
    |> order_by([e], asc: e.published_at, asc: e.inserted_at)
    |> Repo.all()
  end

  @doc "Take a post out of the queue (it won't be emailed)."
  def remove(user_id, entry_id) do
    {count, _} =
      from(e in Entry,
        where:
          e.id == ^entry_id and e.user_id == ^user_id and is_nil(e.newsletter_send_id) and
            not is_nil(e.newsletter_queued_at)
      )
      |> Repo.update_all(set: [newsletter_queued_at: nil])

    if count == 1, do: :ok, else: {:error, :not_found}
  rescue
    Ecto.Query.CastError -> {:error, :not_found}
  end

  # ── When ──

  @doc """
  The most recent weekly send time at or before `now` (UTC), for a writer in
  weekly mode.
  """
  def last_weekly_due(%User{} = user, now \\ DateTime.utc_now()) do
    tz = timezone(user)
    local_today = now |> DateTime.shift_zone!(tz, Tz.TimeZoneDatabase) |> DateTime.to_date()
    back = rem(Date.day_of_week(local_today) - user.newsletter_digest_day + 7, 7)
    candidate = local_at(Date.add(local_today, -back), user.newsletter_digest_hour, tz)

    if DateTime.compare(candidate, now) == :gt do
      local_at(Date.add(local_today, -back - 7), user.newsletter_digest_hour, tz)
    else
      candidate
    end
  end

  @doc "The next weekly send time after `now`."
  def next_weekly_due(%User{} = user, now \\ DateTime.utc_now()) do
    last = last_weekly_due(user, now)
    tz = timezone(user)
    last_local = last |> DateTime.shift_zone!(tz, Tz.TimeZoneDatabase) |> DateTime.to_date()
    local_at(Date.add(last_local, 7), user.newsletter_digest_hour, tz)
  end

  defp timezone(%User{newsletter_digest_timezone: tz}) do
    if valid_timezone?(tz), do: tz, else: "Etc/UTC"
  end

  # The UTC instant of `hour`:00 on `date` in `tz`. A skipped hour (spring
  # forward) means the first moment after it; a repeated one, the first.
  defp local_at(date, hour, tz) do
    case DateTime.new(date, Time.new!(hour, 0, 0), tz, Tz.TimeZoneDatabase) do
      {:ok, dt} -> DateTime.shift_zone!(dt, "Etc/UTC")
      {:ambiguous, first, _second} -> DateTime.shift_zone!(first, "Etc/UTC")
      {:gap, _before, after_gap} -> DateTime.shift_zone!(after_gap, "Etc/UTC")
    end
  end

  defp last_digest_at(user_id) do
    from(s in Send,
      where: s.writer_id == ^user_id and s.kind == "digest" and s.status in ["queued", "sending", "sent"],
      select: max(s.inserted_at)
    )
    |> Repo.one()
  end

  defp within?(nil, _now, _seconds), do: false
  defp within?(at, now, seconds), do: DateTime.diff(now, at, :second) < seconds

  @doc "Whether this writer's waiting posts should go out now."
  def due?(%User{} = user, queued, now \\ DateTime.utc_now()) do
    case {queued, user.newsletter_mode} do
      {[], _} ->
        false

      # Switched back to one email per post: send what was waiting.
      {_, "each"} ->
        true

      {_, "weekly"} ->
        last_due = last_weekly_due(user, now)
        Enum.any?(queued, &(DateTime.compare(&1.newsletter_queued_at, last_due) != :gt))

      {_, "count"} ->
        oldest = queued |> Enum.map(& &1.newsletter_queued_at) |> Enum.min(DateTime)
        waited_too_long = DateTime.diff(now, oldest, :second) >= @max_wait_days * 86_400

        enough =
          length(queued) >= user.newsletter_digest_count and
            not within?(last_digest_at(user.id), now, @count_spacing_days * 86_400)

        waited_too_long or enough

      _ ->
        false
    end
  end

  @doc "Send the writer's digest if it's due (called after a post is queued, and hourly)."
  def maybe_send(%User{} = user, now \\ DateTime.utc_now()) do
    if user.newsletter_enabled && due?(user, queued_entries(user.id), now) do
      send_digest(user)
    else
      :not_due
    end
  end

  @doc """
  Whether the writer may press "Send now": something is waiting and no digest
  went out in the last day.
  """
  def can_send_now?(%User{} = user, queued \\ nil, now \\ DateTime.utc_now()) do
    queued = queued || queued_entries(user.id)
    queued != [] and not within?(last_digest_at(user.id), now, @send_now_spacing_hours * 3600)
  end

  # ── Sending ──

  @doc """
  Turn everything waiting into one digest and queue its delivery. Rows are
  locked so a publish and the hourly check can't both send the same posts.
  """
  def send_digest(%User{} = user) do
    Repo.transaction(fn ->
      entries =
        queue_query(user.id)
        |> order_by([e], asc: e.published_at, asc: e.inserted_at)
        |> lock("FOR UPDATE")
        |> Repo.all()

      recipients = Newsletter.count_subscribers(user.id)

      cond do
        entries == [] ->
          {:error, :nothing_waiting}

        recipients == 0 ->
          # Nobody to send to: let them go rather than mailing old posts to
          # whoever subscribes next month.
          ids = Enum.map(entries, & &1.id)
          from(e in Entry, where: e.id in ^ids) |> Repo.update_all(set: [newsletter_queued_at: nil])
          {:error, :no_subscribers}

        true ->
          {:ok, send} =
            %Send{}
            |> Send.changeset(%{
              writer_id: user.id,
              kind: "digest",
              subject: subject(user, entries),
              recipient_count: recipients,
              status: "queued"
            })
            |> Repo.insert()

          ids = Enum.map(entries, & &1.id)
          from(e in Entry, where: e.id in ^ids) |> Repo.update_all(set: [newsletter_send_id: send.id])

          %{send_id: send.id}
          |> Inkwell.Workers.NewsletterDeliveryWorker.new()
          |> Oban.insert!()

          {:ok, send}
      end
    end)
    |> case do
      {:ok, result} -> result
      {:error, reason} -> {:error, reason}
    end
  end

  defp subject(user, [entry]) do
    entry.title || "New post from #{user.display_name || user.username}"
  end

  defp subject(user, entries) do
    "#{length(entries)} new entries from #{user.display_name || user.username}"
  end

  @doc "Posts carried by a digest send, in the order they were written."
  def entries_for(%Send{id: id}) do
    from(e in Entry,
      where: e.newsletter_send_id == ^id and e.status == :published and e.privacy == :public,
      order_by: [asc: e.published_at, asc: e.inserted_at]
    )
    |> Repo.all()
  end

  @doc "Put a cancelled digest's posts back in the queue."
  def release(%Send{id: id}) do
    from(e in Entry, where: e.newsletter_send_id == ^id)
    |> Repo.update_all(set: [newsletter_send_id: nil])
  end

  # ── For the settings page ──

  @doc "What's waiting and when it goes out."
  def status(%User{} = user, now \\ DateTime.utc_now()) do
    queued = queued_entries(user.id)
    last = last_digest_at(user.id)

    next =
      case user.newsletter_mode do
        "weekly" ->
          if due?(user, queued, now), do: now, else: next_weekly_due(user, now)

        "count" when queued != [] ->
          oldest = queued |> Enum.map(& &1.newsletter_queued_at) |> Enum.min(DateTime)
          latest = DateTime.add(oldest, @max_wait_days * 86_400, :second)

          cond do
            # Enough waiting: now, or once 3 days have passed since the last digest.
            length(queued) >= user.newsletter_digest_count and within?(last, now, @count_spacing_days * 86_400) ->
              Enum.min([DateTime.add(last, @count_spacing_days * 86_400, :second), latest], DateTime)

            length(queued) >= user.newsletter_digest_count ->
              now

            true ->
              latest
          end

        _ ->
          nil
      end

    %{
      queued:
        Enum.map(queued, fn e ->
          %{id: e.id, title: e.title, slug: e.slug, published_at: e.published_at, queued_at: e.newsletter_queued_at}
        end),
      # weekly: when it goes; count: when it goes once enough are waiting, else the latest it will go
      next_send_at: next,
      posts_needed:
        if(user.newsletter_mode == "count", do: max(user.newsletter_digest_count - length(queued), 0)),
      last_sent_at: last,
      can_send_now: can_send_now?(user, queued, now)
    }
  end
end
