defmodule Inkwell.Billing.Trials do
  @moduledoc """
  Free 14-day Plus trial. No card, one per account, ends on its own.

  A trialing user has `subscription_tier: "plus"`, `subscription_status:
  "trialing"`, and `subscription_expires_at` set to the end of the trial, so
  every existing Plus check just works. `ExpirePlusTrialsWorker` flips expired
  trials back to free; saved customizations stay in the database exactly like
  any other Plus downgrade.

  Subscribing during a trial replaces the trial: the Square subscription
  handlers write `status: "active"` and clear `subscription_expires_at`.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  @trial_days 14

  def trial_days, do: @trial_days

  @doc "Whether this user can start a trial right now, and if not, why."
  def eligibility(%User{} = user) do
    cond do
      User.founding_member?(user) -> {:error, :already_plus}
      user.subscription_tier == "plus" -> {:error, :already_plus}
      not is_nil(user.plus_trial_started_at) -> {:error, :trial_already_used}
      true -> :ok
    end
  end

  def eligible?(%User{} = user), do: eligibility(user) == :ok

  def start(%User{} = user) do
    with :ok <- eligibility(user) do
      now = DateTime.utc_now()

      user
      |> User.subscription_changeset(%{
        subscription_tier: "plus",
        subscription_status: "trialing",
        subscription_expires_at: DateTime.add(now, @trial_days, :day),
        plus_trial_started_at: now
      })
      |> Repo.update()
      |> case do
        {:ok, updated} ->
          Logger.info("[Trial] Started Plus trial for @#{updated.username}")
          Inkwell.Slack.notify(":seedling: @#{updated.username} started a 14-day Plus trial")
          {:ok, updated}

        error ->
          error
      end
    end
  end

  @doc "Downgrade every trial whose end date has passed. Returns the count."
  def expire_due(now \\ DateTime.utc_now()) do
    from(u in User,
      where: u.subscription_status == "trialing",
      where: not is_nil(u.subscription_expires_at),
      where: u.subscription_expires_at <= ^now
    )
    |> Repo.all()
    |> Enum.reduce(0, fn user, n ->
      case user
           |> User.subscription_changeset(%{
             subscription_tier: "free",
             subscription_status: "none",
             subscription_expires_at: nil
           })
           |> Repo.update() do
        {:ok, %User{subscription_tier: "free"} = updated} ->
          domain = active_custom_domain(user.id)
          Inkwell.Billing.deactivate_custom_domain_unless_plus(updated.id)
          maybe_enqueue_email(updated, "ended", %{"domain" => domain})
          Logger.info("[Trial] Plus trial ended for @#{updated.username}")
          n + 1

        {:ok, _still_plus} ->
          n

        {:error, cs} ->
          Logger.error("[Trial] Could not end trial for @#{user.username}: #{inspect(cs.errors)}")
          n
      end
    end)
  end

  # ── Trial emails ────────────────────────────────────────────────────────
  #
  # Two notes per trial, both from the hourly ExpirePlusTrialsWorker run:
  # a reminder about two days before the end, and a short note once it has
  # ended. Written as plain text in Stanton's voice and sent through the
  # announcement template (one-click unsubscribe, replies go to the support
  # inbox). People who turned email off, suspended accounts and fediverse
  # sign-ins without a real address get neither.

  @reminder_window_hours 48

  @doc "Queue the reminder for trials ending within two days. Returns the count."
  def send_due_reminders(now \\ DateTime.utc_now()) do
    window_end = DateTime.add(now, @reminder_window_hours, :hour)

    from(u in User,
      where: u.subscription_status == "trialing",
      where: u.subscription_expires_at > ^now and u.subscription_expires_at <= ^window_end,
      where: fragment("(?->>'plus_trial_reminder_sent_at') IS NULL", u.settings)
    )
    |> Repo.all()
    |> Enum.count(fn user ->
      # Mark first, so a failed enqueue can't turn into an hourly resend.
      settings = Map.put(user.settings || %{}, "plus_trial_reminder_sent_at", DateTime.to_iso8601(now))

      case user |> Ecto.Changeset.change(settings: settings) |> Repo.update() do
        {:ok, updated} ->
          maybe_enqueue_email(updated, "reminder", %{"domain" => active_custom_domain(user.id)}) == :queued

        {:error, _} ->
          false
      end
    end)
  end

  @doc false
  def emailable?(%User{} = user) do
    is_binary(user.email) and user.email != "" and is_nil(user.blocked_at) and
      not String.ends_with?(user.email, ".fediverse.inkwell.social") and
      (user.settings || %{})["email_notifications_disabled"] != true
  end

  defp maybe_enqueue_email(%User{} = user, kind, extra) do
    if emailable?(user) do
      %{"user_id" => user.id, "kind" => kind}
      |> Map.merge(extra)
      |> Inkwell.Workers.TrialEmailWorker.new()
      |> Oban.insert()

      :queued
    else
      :skipped
    end
  end

  defp active_custom_domain(user_id) do
    case Inkwell.CustomDomains.get_domain_by_user(user_id) do
      %{status: status, domain: domain} when status in [:active, "active", :pending_cert, "pending_cert"] -> domain
      _ -> nil
    end
  end

  @doc "Subject and plain-text body for a trial email."
  def email_content("reminder", %User{} = user, domain) do
    ends = format_day(user.subscription_expires_at)

    domain_line =
      if domain,
        do: "\n\nOne thing to know: #{domain} will stop showing your journal when the trial ends, and starts again the moment you turn Plus back on.",
        else: ""

    body = """
    Hey #{first_name(user)}!

    Your Plus trial on Inkwell ends #{ends}. I hope you've had fun with it.

    If you'd like to keep it, you can pick monthly ($5) or yearly ($50) here:
    #{frontend_url()}/settings/billing

    If you don't, nothing breaks. You go back to the free plan and everything you customized stays saved, so it all comes back if you ever turn Plus on again.#{domain_line}

    Thanks for trying it out. If something about Plus felt missing or annoying, just reply and tell me. I read every one.
    """

    {"Your Inkwell Plus trial ends #{ends}", body}
  end

  def email_content("ended", %User{} = user, domain) do
    domain_line = if domain, do: " #{domain} is paused for now too.", else: ""

    body = """
    Hey #{first_name(user)}!

    Your 14-day Plus trial just ended, so your journal is back on the free plan. Everything you set up is still saved and comes right back if you turn Plus on.#{domain_line}

    #{frontend_url()}/settings/billing

    Either way, thanks for giving it a try. I'd really like to know what would have made Plus worth it for you, so if anything comes to mind, just reply.
    """

    {"Your Inkwell Plus trial has ended", body}
  end

  defp first_name(%User{display_name: name}) when is_binary(name) and name != "" do
    name |> String.split(~r/\s+/, trim: true) |> List.first()
  end

  defp first_name(%User{username: username}), do: username

  defp format_day(%DateTime{} = dt) do
    # Dates in these emails are read in the writer's own time zone, which we
    # don't know; name the day in UTC, which is never more than a day off.
    Calendar.strftime(dt, "%A, %B %-d")
  end

  defp frontend_url, do: Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")
end
