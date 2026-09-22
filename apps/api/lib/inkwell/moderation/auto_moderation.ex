defmodule Inkwell.Moderation.AutoModeration do
  @moduledoc """
  Automated, rule-based spam moderation. Runs without an admin:

    * `scan_recent/0` (hourly) — new accounts, accounts with pending reports,
      and anyone who just published.
    * `scan_all/0` (daily) — every non-exempt account under 180 days old.
    * `scan_user/1` — on demand (a new report, or a new account publishing).

  Scores come from `Inkwell.Moderation.SpamSignals`. Decisions:

    * score >= block threshold → **block**: sign out, hide every published entry
      (status `:hidden`, federated Delete sent), resolve their pending reports,
      email a suspension notice with how to appeal.
    * score >= limit threshold → **limit**: kept out of Explore/trending until
      an admin looks; nothing is deleted or hidden from followers.

  Never acts on: admins, paying members (Plus subscription or Founding),
  accounts an admin already cleared, or established accounts — those raise a
  Slack "needs review" alert instead. An admin-cleared account is only
  alerted on again if someone reports it after the clearance; otherwise it's
  left alone for good.

  Every action is recorded in `moderation_actions` and can be undone with
  `undo/2`, which restores exactly the entries it hid.

  `mode/0` is `:enforce` or `:dry_run` (AUTO_MODERATION_MODE). Dry run
  scores and logs "would block/limit" to Slack but changes nothing.
  """

  alias Inkwell.Accounts
  alias Inkwell.Accounts.User
  alias Inkwell.Journals.{Comment, Entry}
  alias Inkwell.Moderation.{ModerationAction, Report, SpamSignals}
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  def mode do
    case Application.get_env(:inkwell, :auto_moderation_mode, :dry_run) do
      m when m in [:enforce, "enforce"] -> :enforce
      _ -> :dry_run
    end
  end

  # ── Candidates ───────────────────────────────────────────────────────────

  def scan_recent do
    week_ago = ago(7, :day)
    two_hours_ago = ago(2, :hour)

    reported_ids =
      from(r in Report,
        join: e in Entry, on: e.id == r.entry_id,
        where: r.status == "pending",
        select: e.user_id
      )

    recent_posters =
      from(e in Entry, where: e.status == :published and e.published_at >= ^two_hours_ago, select: e.user_id)

    from(u in base_candidates(),
      where: u.inserted_at >= ^week_ago or u.id in subquery(reported_ids) or u.id in subquery(recent_posters)
    )
    |> Repo.all()
    |> run_scan()
  end

  def scan_all do
    cutoff = ago(180, :day)

    from(u in base_candidates(), where: u.inserted_at >= ^cutoff)
    |> Repo.all()
    |> run_scan()
  end

  def scan_user(user_id) do
    case Repo.get(User, user_id) do
      %User{blocked_at: nil} = u -> run_scan([u])
      _ -> %{scanned: 0, blocked: [], limited: [], review: []}
    end
  end

  defp base_candidates do
    from(u in User, where: is_nil(u.blocked_at), where: u.role != "admin" or is_nil(u.role))
  end

  defp run_scan(users) do
    learned = learned_spam_domains()

    users
    |> Enum.reduce(%{scanned: 0, blocked: [], limited: [], review: [], alerts: []}, fn user, acc ->
      acc = %{acc | scanned: acc.scanned + 1}

      try do
        case evaluate(user, learned) do
          {:block, result} -> apply_decision(:block, user, result, acc)
          {:limit, result} -> apply_decision(:limit, user, result, acc)
          {:review, result} -> apply_decision(:review, user, result, acc)
          _ -> acc
        end
      rescue
        e ->
          Logger.error("[AutoMod] scan failed for #{user.id}: #{Exception.message(e)}")
          acc
      end
    end)
    |> send_scan_alerts()
  end

  # One Slack message per scan, not one per account.
  defp send_scan_alerts(%{alerts: []} = acc), do: Map.delete(acc, :alerts)

  defp send_scan_alerts(%{alerts: alerts} = acc) do
    header =
      if mode() == :dry_run,
        do: ":test_tube: *Auto-moderation dry run* — nothing was changed:",
        else: ":shield: *Auto-moderation* (undo anything that looks wrong):"

    lines = alerts |> Enum.reverse() |> Enum.take(40)
    more = if length(alerts) > 40, do: "\n…and #{length(alerts) - 40} more", else: ""

    notify(header <> "\n" <> Enum.join(lines, "\n") <> more <> "\nhttps://inkwell.social/admin/moderation")
    Map.delete(acc, :alerts)
  end

  # ── Evaluation ───────────────────────────────────────────────────────────

  @doc """
  Returns `{:block | :limit | :review | :none | :exempt, %{score, reasons}}`
  without changing anything.
  """
  def evaluate(%User{} = user, learned \\ nil) do
    learned = learned || learned_spam_domains()
    facts = gather_facts(user, learned)
    result = SpamSignals.score(facts)
    decision = SpamSignals.decision(result)

    cond do
      exempt_reason = exemption(user, facts) ->
        if decision == :block and not quietly_cleared?(user, facts),
          do: {:review, Map.update!(result, :reasons, &(&1 ++ ["not acted on: #{exempt_reason}"]))},
          else: {:exempt, result}

      decision == :limit and user.moderation_state == "limited" ->
        {:none, result}

      true ->
        {decision, result}
    end
  end

  defp exemption(user, facts) do
    cond do
      Accounts.is_admin?(user) -> "admin"
      not is_nil(user.founding_member_number) -> "Founding Member"
      not is_nil(user.square_subscription_id) and user.subscription_status == "active" -> "paying member"
      user.ink_donor_status == "active" -> "Ink Donor"
      not is_nil(user.moderation_cleared_at) -> "cleared by an admin"
      SpamSignals.established?(facts) -> "established account"
      true -> nil
    end
  end

  # An admin already looked at this account and decided it's fine. Stay
  # silent unless someone has reported it since.
  defp quietly_cleared?(%User{moderation_cleared_at: nil}, _), do: false

  defp quietly_cleared?(user, facts),
    do: not Enum.any?(facts[:reports] || [], &(DateTime.compare(&1.at, user.moderation_cleared_at) == :gt))

  @doc false
  def gather_facts(%User{} = user, learned) do
    now = DateTime.utc_now()

    entries =
      from(e in Entry,
        where: e.user_id == ^user.id and e.status == :published,
        order_by: [desc: e.published_at],
        limit: 25,
        select: %{title: e.title, body_html: e.body_html, published_at: e.published_at}
      )
      |> Repo.all()

    comments =
      from(c in Comment, where: c.user_id == ^user.id, order_by: [desc: c.inserted_at], limit: 25, select: c.body_html)
      |> Repo.all()

    guestbook =
      from(g in Inkwell.Guestbook.GuestbookEntry,
        where: g.author_id == ^user.id and g.profile_user_id != ^user.id,
        limit: 25,
        select: g.body
      )
      |> Repo.all()

    first_post =
      from(e in Entry, where: e.user_id == ^user.id and not is_nil(e.published_at), select: min(e.published_at))
      |> Repo.one()

    {published_days, first_published, last_published} =
      from(e in Entry,
        where: e.user_id == ^user.id and e.status == :published,
        select: {count(fragment("DISTINCT date(?)", e.published_at)), min(e.published_at), max(e.published_at)}
      )
      |> Repo.one()

    interactions =
      Repo.one(from(c in Comment, where: c.user_id == ^user.id, select: count(c.id))) +
        Repo.one(from(i in Inkwell.Inks.Ink, where: i.user_id == ^user.id, select: count(i.id))) +
        Repo.one(from(s in Inkwell.Stamps.Stamp, where: s.user_id == ^user.id, select: count(s.id))) +
        Repo.one(from(r in Inkwell.Social.Relationship, where: r.follower_id == ^user.id, select: count(r.id)))

    reports =
      from(r in Report,
        join: e in Entry, on: e.id == r.entry_id,
        join: reporter in User, on: reporter.id == r.reporter_id,
        where: e.user_id == ^user.id and r.status == "pending",
        distinct: r.reporter_id,
        select: %{reporter: reporter, at: r.inserted_at}
      )
      |> Repo.all()
      |> Enum.map(fn %{reporter: rep, at: at} -> %{trusted: trusted_reporter?(rep), at: at} end)

    spam_warnings =
      from(w in Inkwell.Moderation.UserWarning,
        where: w.user_id == ^user.id and w.reason == "spam",
        select: count(w.id)
      )
      |> Repo.one()

    entry_texts = Enum.flat_map(entries, &[&1.title || "", strip(&1.body_html)])
    social = user.social_links |> Kernel.||(%{}) |> Map.values() |> Enum.filter(&is_binary/1)

    %{
      email_domain: email_domain(user.email),
      learned_spam_domains: learned,
      minutes_to_first_post: first_post && DateTime.diff(first_post, user.inserted_at, :second) / 60,
      texts:
        Enum.reject(entry_texts ++ Enum.map(comments, &strip/1) ++ guestbook ++ [strip(user.bio_html || user.bio)], &(&1 in [nil, ""])),
      links:
        Enum.flat_map(entries, &SpamSignals.extract_links(&1.body_html)) ++
          Enum.flat_map(comments, &SpamSignals.extract_links/1) ++
          Enum.flat_map(guestbook, &SpamSignals.extract_links/1),
      profile_links: SpamSignals.extract_links(user.bio_html || user.bio) ++ social,
      interactions: interactions,
      reports: reports,
      spam_warnings: spam_warnings,
      account_age_days: DateTime.diff(now, user.inserted_at, :day),
      published_entry_days: published_days,
      writing_span_days: if(first_published, do: DateTime.diff(last_published, first_published, :day), else: 0)
    }
  end

  @doc "A reporter whose reports carry weight: 30+ days old, in good standing, and has written."
  def trusted_reporter?(%User{} = u) do
    DateTime.diff(DateTime.utc_now(), u.inserted_at, :day) >= 30 and is_nil(u.blocked_at) and
      is_nil(u.moderation_state) and
      Repo.exists?(from(e in Entry, where: e.user_id == ^u.id and e.status == :published))
  end

  @doc "Email domains (excluding big providers) with 2+ blocked accounts."
  def learned_spam_domains do
    from(u in User,
      where: not is_nil(u.blocked_at) and not is_nil(u.email),
      group_by: fragment("lower(split_part(?, '@', 2))", u.email),
      having: count(u.id) >= 2,
      select: fragment("lower(split_part(?, '@', 2))", u.email)
    )
    |> Repo.all()
    |> Enum.reject(&SpamSignals.common_provider?/1)
    |> MapSet.new()
  end

  # ── Actions ──────────────────────────────────────────────────────────────

  defp apply_decision(:review, user, result, acc) do
    acc =
      if recently_alerted?(user) do
        acc
      else
        record(user, "limit", result, [], automated: true, dry_run_note: :review_only)
        add_alert(acc, "• @#{user.username} scored #{result.score} but wasn't acted on — #{short_reasons(result)}")
      end

    %{acc | review: [user.username | acc.review]}
  end

  defp apply_decision(kind, user, result, acc) do
    if mode() == :dry_run do
      acc =
        if recently_alerted?(user) do
          acc
        else
          record(user, "limit", result, [], automated: true, dry_run_note: kind)
          add_alert(acc, "• would #{kind} @#{user.username} (#{result.score}) — #{short_reasons(result)}")
        end

      Map.update!(acc, if(kind == :block, do: :blocked, else: :limited), &[user.username | &1])
    else
      case kind do
        :block -> block!(user, result)
        :limit -> limit!(user, result)
      end

      acc
      |> add_alert("• #{if kind == :block, do: "blocked", else: "limited"} @#{user.username} (#{result.score}) — #{short_reasons(result)}")
      |> Map.update!(if(kind == :block, do: :blocked, else: :limited), &[user.username | &1])
    end
  end

  @doc "Block an account for spam and hide all of its published entries."
  def block!(%User{} = user, result) do
    {:ok, blocked} = Accounts.block_user(user)
    action = hide_content(blocked, result, true, "Auto-moderation: account blocked for spam")
    send_suspension_email(blocked)

    Logger.warning("[AutoMod] Blocked @#{user.username} (score #{result.score}): #{Enum.join(result.reasons, "; ")}")
    {:ok, action}
  end

  @doc """
  Call after any non-automated block (admin Block button, third strike,
  payment dispute) so the account's posts disappear too and the block can be
  undone from Admin → Moderation.
  """
  def after_manual_block(%User{} = user, reason) do
    hide_content(user, %{score: nil, reasons: [reason]}, false, reason)
  rescue
    e ->
      Logger.error("[AutoMod] after_manual_block failed for #{user.id}: #{Exception.message(e)}")
      nil
  end

  @doc "Call after an admin unblocks someone: restores posts hidden by their latest block."
  def after_manual_unblock(%User{} = user, %User{} = admin) do
    case Repo.one(
           from(a in ModerationAction,
             where: a.user_id == ^user.id and a.action == "block" and is_nil(a.reversed_at),
             order_by: [desc: a.inserted_at],
             limit: 1
           )
         ) do
      nil -> {:ok, 0}
      action -> undo(action, admin)
    end
  end

  defp hide_content(user, result, automated?, report_note) do
    hidden_ids = hide_published_entries(user)
    resolve_pending_reports(user, report_note)

    Inkwell.Workers.SearchIndexWorker.new(%{"action" => "delete_user_entries", "user_id" => user.id})
    |> Oban.insert()

    record(user, "block", result, hidden_ids, automated: automated?)
  end

  @doc "Keep an account out of Explore/trending without hiding anything."
  def limit!(%User{} = user, result) do
    {:ok, limited} = user |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update()
    action = record(limited, "limit", result, [])
    Logger.info("[AutoMod] Limited @#{user.username} (score #{result.score})")
    {:ok, action}
  end

  @doc """
  Hide one entry immediately (e.g. reported as illegal content) without
  blocking the author.
  """
  def hide_entry!(%Entry{} = entry, reason) do
    {1, _} = from(e in Entry, where: e.id == ^entry.id and e.status == :published) |> Repo.update_all(set: [status: :hidden])
    federate_delete(entry)

    %ModerationAction{}
    |> ModerationAction.changeset(%{user_id: entry.user_id, entry_id: entry.id, action: "hide_entry", reasons: [reason], hidden_entry_ids: [entry.id]})
    |> Repo.insert()
  rescue
    MatchError -> {:error, :not_published}
  end

  @doc "Undo an action: unblock/unlimit and restore exactly the entries it hid."
  def undo(%ModerationAction{reversed_at: nil} = action, %User{} = admin) do
    user = Repo.get!(User, action.user_id)

    Repo.transaction(fn ->
      case action.action do
        "block" -> Accounts.unblock_user(user)
        "limit" -> user |> Ecto.Changeset.change(moderation_state: nil) |> Repo.update()
        _ -> :ok
      end

      restored =
        if action.hidden_entry_ids != [] do
          {_, restored} =
            from(e in Entry, where: e.id in ^action.hidden_entry_ids and e.status == :hidden, select: e)
            |> Repo.update_all(set: [status: :published])

          restored
        else
          []
        end

      Repo.get!(User, user.id)
      |> Ecto.Changeset.change(moderation_cleared_at: DateTime.utc_now(), moderation_state: nil)
      |> Repo.update!()

      action
      |> Ecto.Changeset.change(reversed_at: DateTime.utc_now(), reversed_by_id: admin.id)
      |> Repo.update!()

      restored
    end)
    |> case do
      {:ok, restored} ->
        Enum.each(restored, &federate_create/1)
        Logger.info("[AutoMod] @#{admin.username} undid #{action.action} on @#{user.username}; restored #{length(restored)} entries")
        {:ok, length(restored)}

      error ->
        error
    end
  end

  def undo(%ModerationAction{}, _), do: {:error, :already_reversed}

  defp hide_published_entries(user) do
    entries = from(e in Entry, where: e.user_id == ^user.id and e.status == :published) |> Repo.all()
    ids = Enum.map(entries, & &1.id)

    if ids != [] do
      from(e in Entry, where: e.id in ^ids) |> Repo.update_all(set: [status: :hidden])
      Enum.each(entries, &federate_delete/1)
    end

    ids
  end

  defp federate_delete(%Entry{ap_id: ap_id, privacy: :public, user_id: uid}) when is_binary(ap_id) do
    Inkwell.Federation.Workers.FanOutWorker.new(%{entry_ap_id: ap_id, action: "delete", user_id: uid}) |> Oban.insert()
  end

  defp federate_delete(_), do: :ok

  defp federate_create(%Entry{privacy: :public} = e) do
    Inkwell.Federation.Workers.FanOutWorker.new(%{entry_id: e.id, action: "create", user_id: e.user_id}) |> Oban.insert()
  end

  defp federate_create(_), do: :ok

  defp resolve_pending_reports(user, note) do
    scope =
      from(r in Report,
        join: e in Entry,
        on: e.id == r.entry_id,
        where: e.user_id == ^user.id and r.status == "pending"
      )

    entry_ids = scope |> select([r], r.entry_id) |> Repo.all() |> Enum.uniq()

    result =
      Repo.update_all(scope,
        set: [status: "actioned", admin_notes: note, resolved_at: DateTime.utc_now()]
      )

    # This bypasses Moderation.resolve_report/2, so clear the admins'
    # notifications here too.
    Inkwell.Accounts.mark_report_notifications_read_for_entries(entry_ids)

    result
  end

  defp record(user, action, result, hidden_ids, opts) do
    reasons =
      case opts[:dry_run_note] do
        nil -> result.reasons
        :review_only -> ["[needs review — not acted on]" | result.reasons]
        kind -> ["[dry run — would #{kind}]" | result.reasons]
      end

    %ModerationAction{}
    |> ModerationAction.changeset(%{
      user_id: user.id,
      action: action,
      automated: Keyword.get(opts, :automated, true),
      score: result.score,
      reasons: reasons,
      hidden_entry_ids: hidden_ids
    })
    |> Repo.insert!()
    |> then(fn a ->
      # Dry-run and review records are notes, not live actions.
      if opts[:dry_run_note], do: a |> Ecto.Changeset.change(reversed_at: DateTime.utc_now()) |> Repo.update!(), else: a
    end)
  end

  defp record(user, action, result, hidden_ids), do: record(user, action, result, hidden_ids, [])

  # Don't repeat a review/dry-run alert for the same account more than daily.
  defp recently_alerted?(user) do
    day_ago = ago(1, :day)
    Repo.exists?(from(a in ModerationAction, where: a.user_id == ^user.id and a.inserted_at >= ^day_ago))
  end

  # Skip fediverse placeholders and throwaway mailboxes — bounces from those
  # hurt Inkwell's email sender reputation.
  defp send_suspension_email(%User{email: email} = user) when is_binary(email) do
    domain = email_domain(email)

    unless String.ends_with?(email, ".fediverse.inkwell.social") or SpamSignals.disposable_domain?(domain) do
      Task.start(fn -> Inkwell.Email.send_spam_suspension(user) end)
    end
  end

  defp send_suspension_email(_), do: :ok

  # ── Reports ──────────────────────────────────────────────────────────────

  @doc """
  Called whenever someone files a report. Always queues a scan of the author.
  Reports of illegal content hide that one entry right away when the reporter
  is trusted or a second person reports it too, and always alert the admin —
  there is no automated detection of illegal images, so reports are the only
  signal.
  """
  def handle_new_report(%Report{} = report, %User{} = reporter) do
    case Repo.get(Entry, report.entry_id) do
      nil ->
        :ok

      entry ->
        if entry.user_id != reporter.id do
          Inkwell.Workers.AutoModerationWorker.enqueue_user(entry.user_id)
        end

        if report.reason == "csam_illegal", do: handle_illegal_report(entry, reporter), else: :ok
    end
  rescue
    e ->
      Logger.error("[AutoMod] handle_new_report failed: #{Exception.message(e)}")
      :ok
  end

  defp handle_illegal_report(entry, reporter) do
    reporters =
      from(r in Report,
        where: r.entry_id == ^entry.id and r.reason == "csam_illegal" and r.status == "pending",
        select: count(r.reporter_id, :distinct)
      )
      |> Repo.one()

    author = Repo.get(User, entry.user_id)
    url = "https://inkwell.social/#{author && author.username}/#{entry.slug}"

    if trusted_reporter?(reporter) or reporters >= 2 do
      hide_entry!(entry, "reported as illegal content (#{reporters} reporter(s))")

      notify(":rotating_light: *Illegal content report — entry hidden* by @#{author && author.username}: #{url} " <>
        "(reported by @#{reporter.username}). Review in Admin → Reports; undo in Admin → Moderation if it's fine.")
    else
      notify(":rotating_light: *Illegal content report* on #{url} by new account @#{reporter.username}. " <>
        "Not hidden automatically (reporter is new) — please look soon.")
    end
  end

  # ── Daily digest ─────────────────────────────────────────────────────────

  def daily_digest do
    since = ago(1, :day)

    actions =
      from(a in ModerationAction,
        join: u in User, on: u.id == a.user_id,
        where: a.inserted_at >= ^since and a.automated and is_nil(a.reversed_at),
        select: {a.action, u.username, a.score}
      )
      |> Repo.all()

    if actions != [] do
      lines =
        actions
        |> Enum.group_by(&elem(&1, 0))
        |> Enum.map(fn {action, list} ->
          "• #{action}: " <> Enum.map_join(list, ", ", fn {_, name, score} -> "@#{name} (#{score})" end)
        end)

      notify(":shield: *Auto-moderation, last 24h*\n" <> Enum.join(lines, "\n") <>
        "\nReview or undo: https://inkwell.social/admin/moderation")
    end

    length(actions)
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp notify(text), do: Inkwell.Slack.notify(text)
  defp add_alert(acc, line), do: Map.update(acc, :alerts, [line], &[line | &1])

  defp short_reasons(%{reasons: reasons}),
    do: reasons |> Enum.take(3) |> Enum.join("; ") |> String.slice(0, 220)

  defp ago(n, unit), do: DateTime.add(DateTime.utc_now(), -n, unit)

  defp email_domain(nil), do: nil
  defp email_domain(email), do: email |> String.split("@") |> List.last() |> String.downcase()

  defp strip(nil), do: ""
  defp strip(html), do: html |> String.replace(~r/<[^>]*>/, " ") |> String.replace(~r/\s+/, " ") |> String.trim()
end
