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
          Inkwell.Billing.deactivate_custom_domain_unless_plus(updated.id)
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
end
