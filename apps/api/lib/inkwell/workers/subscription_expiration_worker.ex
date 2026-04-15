defmodule Inkwell.Workers.SubscriptionExpirationWorker do
  @moduledoc """
  Periodically checks for canceled subscriptions past their expiration date
  and downgrades them. Runs every 4 hours via Oban cron.

  Plus downgrades delegate to `Inkwell.Billing.expire_grace_periods/1` so that
  the admin preview and manual-run endpoints share the exact same logic as
  the cron worker. Donor downgrades are handled inline since donors have no
  admin-facing preview/run flow.

  Fires a Slack notification on any non-empty run so the admin sees the
  auto-downgrades in their alerts channel.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Accounts.User
  alias Inkwell.Billing
  alias Inkwell.Repo
  alias Inkwell.Slack

  import Ecto.Query

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    # Expire canceled Plus subscriptions past their expiration date.
    # Billing.expire_grace_periods handles the query, downgrades, logging.
    plus_result = Billing.expire_grace_periods(dry_run: false)

    plus_count = length(plus_result.downgraded)
    plus_error_count = length(plus_result.errors)

    # Best-effort custom domain cleanup for each downgraded user
    for %{id: user_id} <- plus_result.downgraded do
      maybe_deactivate_custom_domain(user_id)
    end

    # Expire canceled Ink Donor subscriptions past their expiration date
    now = DateTime.utc_now()

    expired_donor =
      User
      |> where([u], u.ink_donor_status == "canceled")
      |> where([u], not is_nil(u.subscription_expires_at))
      |> where([u], u.subscription_expires_at < ^now)
      |> Repo.all()

    for user <- expired_donor do
      user
      |> User.ink_donor_changeset(%{
        ink_donor_status: "none",
        ink_donor_amount_cents: nil
      })
      |> Repo.update()

      Logger.info("Expired Ink Donor subscription for #{user.username}")
    end

    donor_count = length(expired_donor)

    if plus_count > 0 or donor_count > 0 or plus_error_count > 0 do
      Logger.info(
        "[SubscriptionExpirationWorker] #{plus_count} Plus downgraded, #{donor_count} Donor expired, #{plus_error_count} errors"
      )

      notify_slack(plus_result.downgraded, expired_donor, plus_result.errors)
    end

    :ok
  end

  defp notify_slack(downgraded_plus, expired_donors, errors) do
    parts = []

    parts =
      if length(downgraded_plus) > 0 do
        names =
          downgraded_plus
          |> Enum.map(fn u -> "@#{u.username}" end)
          |> Enum.join(", ")

        ["*#{length(downgraded_plus)} Plus user(s) auto-downgraded* (grace expired): #{names}" | parts]
      else
        parts
      end

    parts =
      if length(expired_donors) > 0 do
        names =
          expired_donors
          |> Enum.map(fn u -> "@#{u.username}" end)
          |> Enum.join(", ")

        ["*#{length(expired_donors)} Ink Donor(s) auto-expired*: #{names}" | parts]
      else
        parts
      end

    parts =
      if length(errors) > 0 do
        ["⚠ #{length(errors)} error(s) during downgrade — check Phoenix logs" | parts]
      else
        parts
      end

    if parts != [] do
      Slack.notify(Enum.join(parts, "\n"))
    end
  end

  defp maybe_deactivate_custom_domain(user_id) do
    case Inkwell.CustomDomains.get_domain_by_user(user_id) do
      nil ->
        :ok

      domain when domain.status in ["active", "pending_cert", "pending_dns"] ->
        Inkwell.CustomDomains.update_status(domain, "removed")

        if domain.status in ["active", "pending_cert"] do
          Inkwell.Workers.CustomDomainCertWorker.new(%{
            "action" => "delete",
            "hostname" => domain.domain
          })
          |> Oban.insert()
        end

      _domain ->
        :ok
    end
  end
end
