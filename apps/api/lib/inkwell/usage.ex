defmodule Inkwell.Usage do
  @moduledoc """
  Which features people use, so the ones nobody uses can be retired.

  Counts use, not people's behaviour. What is kept:

    * `feature_use_days`: per feature (and action, for the few features that
      report steps, like the game), per UTC day: how many members used it,
      how many signed-out visitors, and how many times in all.
    * `feature_members`: for each member and feature, the first and last day
      they used it and on how many days. That is what makes "12 people in
      the last 30 days" an exact number (daily totals can't be added up into
      people). Deleted with the account.

  Signed-out visitors are counted once a day per feature the same way reader
  stats are (`Inkwell.Reads`): a hash of a random daily salt, the IP and the
  browser, kept in memory until the day ends. No IP, cookie or visitor id is
  stored. Admins aren't counted. Nothing here is shown to anyone but admins.

  Features that already leave their own rows (entries, stamps, letters…)
  aren't recorded again: `report/0` counts those straight from their tables.
  See `Inkwell.Usage.Catalog`.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Reads, Repo}
  alias Inkwell.Usage.Catalog

  @seen_table :feature_use_seen

  # ── Recording ───────────────────────────────────────────────────────────

  @doc """
  Record one use of a tracked feature from a request. `viewer` is the
  signed-in member or nil. Options: `action:`, `detail:` (see the catalog).
  Returns `:counted` or `:skipped`; never raises.
  """
  def record(key, viewer, ip, user_agent, opts \\ []) do
    action = blank_to_empty(opts[:action])
    detail = blank_to_empty(opts[:detail])
    feature = Catalog.get(key)

    cond do
      feature == nil or feature.how != :tracked -> :skipped
      not Catalog.valid_action?(feature, action) -> :skipped
      not Catalog.valid_detail?(feature, detail) -> :skipped
      Reads.bot?(user_agent) -> :skipped
      viewer != nil -> do_member(key, viewer, action, detail)
      true -> do_visitor(key, to_string(ip) <> "|" <> to_string(user_agent), action, detail)
    end
  rescue
    _ -> :skipped
  end

  @doc """
  Record a use from the server, where the work itself happens (saving the
  arranged page, scheduling a post). For signed-in members only.
  """
  def record_member(key, viewer, opts \\ [])
  def record_member(_key, nil, _opts), do: :skipped

  def record_member(key, viewer, opts) do
    action = blank_to_empty(opts[:action])
    detail = blank_to_empty(opts[:detail])

    case Catalog.get(key) do
      %{how: :tracked} = feature ->
        if Catalog.valid_action?(feature, action) and Catalog.valid_detail?(feature, detail),
          do: do_member(key, viewer, action, detail),
          else: :skipped

      _ ->
        :skipped
    end
  rescue
    _ -> :skipped
  end

  defp do_member(key, viewer, action, detail) do
    if Accounts.is_admin?(viewer) do
      :skipped
    else
      today = Date.utc_today()
      mark_member(key, viewer.id, today)
      if action != "", do: note_progress(key, viewer.id, action, detail)
      who = "member:" <> viewer.id
      count_day(key, "", "", today, :members, who)
      if action != "", do: count_day(key, action, detail, today, :members, who)
      :counted
    end
  end

  defp do_visitor(key, who, action, detail) do
    today = Date.utc_today()
    who = "visitor:" <> who
    count_day(key, "", "", today, :visitors, who)
    if action != "", do: count_day(key, action, detail, today, :visitors, who)
    :counted
  end

  defp mark_member(key, user_id, today) do
    Repo.query!(
      """
      INSERT INTO feature_members (feature, user_id, first_used_on, last_used_on, days_used)
      VALUES ($1, $2, $3, $3, 1)
      ON CONFLICT (feature, user_id) DO UPDATE
        SET last_used_on = EXCLUDED.last_used_on, days_used = feature_members.days_used + 1
        WHERE feature_members.last_used_on < EXCLUDED.last_used_on
      """,
      [key, Ecto.UUID.dump!(user_id), today]
    )
  end

  # Steps (the game): how many times each step, and each step per level
  # ("letter_delivered" => 5, "letter_delivered:hard" => 2). Counted every
  # time, not once a day: "delivered 14 letters" is the point.
  defp note_progress(key, user_id, action, detail) do
    keys = if detail == "", do: [action], else: [action, action <> ":" <> detail]

    Enum.each(keys, fn k ->
      Repo.query!(
        """
        UPDATE feature_members
        SET progress = progress || jsonb_build_object($3::text, coalesce((progress->>$3::text)::int, 0) + 1)
        WHERE feature = $1 AND user_id = $2
        """,
        [key, Ecto.UUID.dump!(user_id), k]
      )
    end)
  end

  # Every use adds to `uses`; the first one today from this person adds to
  # `members` or `visitors`.
  defp count_day(key, action, detail, today, who_field, who) do
    first? = first_today?(today, [who, "|", key, "|", action, "|", detail])
    people = if first?, do: 1, else: 0

    row = %{feature: key, action: action, detail: detail, day: today, members: 0, visitors: 0, uses: 1}
    row = Map.put(row, who_field, people)

    Repo.insert_all("feature_use_days", [row],
      on_conflict: [inc: [{who_field, people}, {:uses, 1}]],
      conflict_target: [:feature, :action, :detail, :day]
    )
  end

  defp first_today?(today, parts) do
    key = :crypto.hash(:sha256, [daily_salt(today) | parts])
    :ets.insert_new(@seen_table, {{:seen, today, key}, true})
  end

  # Same as Inkwell.Reads: one random salt per UTC day, dropped with
  # yesterday's marks when the day changes.
  defp daily_salt(today) do
    case :ets.lookup(@seen_table, {:salt, today}) do
      [{_, salt}] ->
        salt

      [] ->
        salt = :crypto.strong_rand_bytes(32)

        if :ets.insert_new(@seen_table, {{:salt, today}, salt}) do
          :ets.select_delete(@seen_table, [
            {{{:seen, :"$1", :_}, :_}, [{:"=/=", :"$1", {:const, today}}], [true]},
            {{{:salt, :"$1"}, :_}, [{:"=/=", :"$1", {:const, today}}], [true]}
          ])

          salt
        else
          daily_salt(today)
        end
    end
  end

  defp blank_to_empty(nil), do: ""
  defp blank_to_empty(v) when is_binary(v), do: String.trim(v)
  defp blank_to_empty(_), do: :invalid

  # ── The report for Admin → Usage ───────────────────────────────────────

  @weeks 12

  @doc """
  Every feature with how many people used it in the last 7, 30 and 90 days,
  ever, the 90 days before that, and a 12-week trend. Admins and suspended
  accounts are left out.
  """
  def report(today \\ Date.utc_today()) do
    excluded = excluded_ids()
    week_starts = week_starts(today)

    features =
      Catalog.all()
      |> Enum.map(fn f ->
        numbers =
          try do
            measure(f, excluded, today, week_starts)
          rescue
            e -> %{error: String.slice(Exception.message(e), 0, 200)}
          end

        f
        |> Map.take([:key, :label, :group, :how, :core, :added])
        |> Map.merge(numbers)
        |> then(&Map.put(&1, :status, status(&1, today)))
      end)

    %{
      today: today,
      tracking_started: Catalog.tracking_started(),
      weeks: week_starts,
      groups: Enum.map(Catalog.groups(), fn {k, l} -> %{key: k, label: l} end),
      members: member_counts(excluded),
      features: features
    }
  end

  defp excluded_ids do
    Accounts.list_admins() |> Enum.map(&Ecto.UUID.dump!(&1.id))
  end

  defp week_starts(today) do
    monday = Date.add(today, -(Date.day_of_week(today) - 1))
    for i <- (@weeks - 1)..0//-1, do: Date.add(monday, -7 * i)
  end

  defp member_counts(excluded) do
    %{rows: [[total, active30]]} =
      Repo.query!(
        """
        SELECT count(*), count(*) FILTER (WHERE last_active_at > now() - interval '30 days')
        FROM users WHERE blocked_at IS NULL AND username <> 'relay' AND NOT (id = ANY($1))
        """,
        [excluded]
      )

    %{total: total, active_30: active30}
  end

  defp measure(%{how: :db, sql: sql}, excluded, today, week_starts) do
    base = """
    WITH s AS (
      SELECT f.uid, f.at FROM (#{sql}) f JOIN users u ON u.id = f.uid
      WHERE u.blocked_at IS NULL AND NOT (u.id = ANY($1)) AND f.at IS NOT NULL
    )
    """

    %{rows: [[d7, d30, d90, ever, prev90, uses90, last]]} =
      Repo.query!(
        base <>
          """
          SELECT count(DISTINCT uid) FILTER (WHERE at >= $2::date - 6),
                 count(DISTINCT uid) FILTER (WHERE at >= $2::date - 29),
                 count(DISTINCT uid) FILTER (WHERE at >= $2::date - 89),
                 count(DISTINCT uid),
                 count(DISTINCT uid) FILTER (WHERE at >= $2::date - 179 AND at < $2::date - 89),
                 count(*) FILTER (WHERE at >= $2::date - 89),
                 max(at)::date
          FROM s
          """,
        [excluded, today]
      )

    %{rows: weekly} =
      Repo.query!(
        base <>
          """
          SELECT w.start, count(DISTINCT s.uid)
          FROM unnest($2::date[]) AS w(start)
          LEFT JOIN s ON s.at >= w.start AND s.at < w.start + 7
          GROUP BY w.start ORDER BY w.start
          """,
        [excluded, week_starts]
      )

    %{
      people_7: d7, people_30: d30, people_90: d90, people_ever: ever,
      people_prev_90: prev90, uses_90: uses90, last_used: last,
      trend: Enum.map(weekly, fn [_, n] -> n end)
    }
  end

  defp measure(%{how: :state, sql: sql}, excluded, _today, _weeks) do
    %{rows: [[n]]} =
      Repo.query!(
        "SELECT count(DISTINCT f.uid) FROM (#{sql}) f JOIN users u ON u.id = f.uid WHERE u.blocked_at IS NULL AND NOT (u.id = ANY($1))",
        [excluded]
      )

    %{people_now: n}
  end

  defp measure(%{how: :tracked, key: key}, _excluded, today, week_starts) do
    members =
      from(m in "feature_members",
        join: u in "users", on: u.id == m.user_id,
        where: m.feature == ^key and is_nil(u.blocked_at),
        select: %{
          d7: filter(count(), m.last_used_on >= ^Date.add(today, -6)),
          d30: filter(count(), m.last_used_on >= ^Date.add(today, -29)),
          d90: filter(count(), m.last_used_on >= ^Date.add(today, -89)),
          ever: count(),
          last: max(m.last_used_on)
        }
      )
      |> Repo.one()

    days = from(d in "feature_use_days", where: d.feature == ^key and d.action == "")

    visitors =
      from(d in days,
        select: %{
          v7: coalesce(filter(sum(d.visitors), d.day >= ^Date.add(today, -6)), 0),
          v30: coalesce(filter(sum(d.visitors), d.day >= ^Date.add(today, -29)), 0),
          v90: coalesce(filter(sum(d.visitors), d.day >= ^Date.add(today, -89)), 0),
          uses90: coalesce(filter(sum(d.uses), d.day >= ^Date.add(today, -89)), 0),
          last: max(d.day)
        }
      )
      |> Repo.one()

    first_week = List.first(week_starts)

    weekly =
      from(d in days,
        where: d.day >= ^first_week,
        group_by: fragment("date_trunc('week', ?)::date", d.day),
        select: {fragment("date_trunc('week', ?)::date", d.day), sum(d.members) + sum(d.visitors)}
      )
      |> Repo.all()
      |> Map.new()

    actions =
      from(d in "feature_use_days",
        where: d.feature == ^key and d.action != "" and d.day >= ^Date.add(today, -29),
        group_by: [d.action, d.detail],
        order_by: [d.action, d.detail],
        select: %{action: d.action, detail: d.detail, people: sum(d.members) + sum(d.visitors), uses: sum(d.uses)}
      )
      |> Repo.all()

    %{
      people_7: members.d7, people_30: members.d30, people_90: members.d90, people_ever: members.ever,
      visitor_days_7: to_int(visitors.v7), visitor_days_30: to_int(visitors.v30),
      visitor_days_90: to_int(visitors.v90), uses_90: to_int(visitors.uses90),
      last_used: [members.last, visitors.last] |> Enum.reject(&is_nil/1) |> Enum.max(Date, fn -> nil end),
      trend: Enum.map(week_starts, &to_int(Map.get(weekly, &1, 0))),
      actions: Enum.map(actions, &%{&1 | people: to_int(&1.people), uses: to_int(&1.uses)}),
      members: members_of(key)
    }
  end

  @doc """
  Who used a tracked feature, most days first (at most `limit`), so Stanton
  can see who's taking something seriously and ask them about it.
  """
  def members_of(key, limit \\ 50) do
    from(m in "feature_members",
      join: u in "users", on: u.id == m.user_id,
      where: m.feature == ^key and is_nil(u.blocked_at),
      order_by: [desc: m.days_used, desc: m.last_used_on],
      limit: ^limit,
      select: %{
        username: u.username,
        display_name: u.display_name,
        first_used: m.first_used_on,
        last_used: m.last_used_on,
        days_used: m.days_used,
        progress: m.progress
      }
    )
    |> Repo.all()
  end

  defp to_int(nil), do: 0
  defp to_int(%Decimal{} = d), do: Decimal.to_integer(d)
  defp to_int(n) when is_integer(n), do: n

  @doc """
  `"new"` (arrived in the last 90 days, too soon to judge), `"counting"`
  (tracked, but tracking hasn't run 30 days), `"retire"` (almost nobody for
  90 days), `"quiet"` (a handful) or `"used"`.
  """
  def status(%{error: _}, _today), do: "error"

  def status(f, today) do
    reach = Map.get(f, :people_90, Map.get(f, :people_now, 0)) + Map.get(f, :visitor_days_90, 0)

    cond do
      f.added && Date.diff(today, f.added) < 90 -> "new"
      f.how == :tracked and Date.diff(today, Catalog.tracking_started()) < 30 -> "counting"
      f.core -> "used"
      reach <= 2 and Map.get(f, :people_prev_90, 0) <= 2 -> "retire"
      reach <= 5 -> "quiet"
      true -> "used"
    end
  end
end
