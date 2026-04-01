defmodule Inkwell.Workers.SubscriptionExpirationWorker do
  @moduledoc """
  Periodically checks for canceled subscriptions past their expiration date
  and downgrades them. Runs every 4 hours via Oban cron.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    now = DateTime.utc_now()

    # Expire canceled Plus subscriptions past their expiration date
    expired_plus =
      User
      |> where([u], u.subscription_status == "canceled")
      |> where([u], not is_nil(u.subscription_expires_at))
      |> where([u], u.subscription_expires_at < ^now)
      |> where([u], u.subscription_tier == "plus")
      |> Repo.all()

    for user <- expired_plus do
      user
      |> User.subscription_changeset(%{
        subscription_tier: "free",
        subscription_status: "none"
      })
      |> Repo.update()

      Logger.info("Expired Plus subscription for #{user.username}")
      maybe_deactivate_custom_domain(user.id)
    end

    # Expire canceled Ink Donor subscriptions past their expiration date
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

    if length(expired_plus) > 0 or length(expired_donor) > 0 do
      Logger.info("Subscription expiration: #{length(expired_plus)} Plus, #{length(expired_donor)} Donor expired")
    end

    :ok
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
