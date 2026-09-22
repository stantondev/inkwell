defmodule Inkwell.Workers.TrialEmailWorker do
  @moduledoc "Sends one Plus-trial email (reminder or ended). Queued by `Inkwell.Billing.Trials`."

  use Oban.Worker,
    queue: :default,
    max_attempts: 3,
    unique: [period: 30 * 24 * 3600, keys: [:user_id, :kind], states: :all]

  alias Inkwell.Accounts.User
  alias Inkwell.Billing.Trials
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => user_id, "kind" => kind} = args})
      when kind in ["reminder", "ended"] do
    with %User{} = user <- Repo.get(User, user_id),
         true <- Trials.emailable?(user),
         true <- still_relevant?(kind, user) do
      {subject, body} = Trials.email_content(kind, user, args["domain"])

      case Inkwell.Email.send_announcement(user, subject, body, replyable: true) do
        {:ok, _} ->
          Logger.info("[Trial] Sent #{kind} email to @#{user.username}")
          :ok

        {:error, reason} ->
          {:error, reason}
      end
    else
      _ -> :ok
    end
  end

  # A reminder is pointless if they subscribed (or the trial already ended)
  # between queueing and sending.
  defp still_relevant?("reminder", %User{subscription_status: "trialing"}), do: true
  defp still_relevant?("reminder", _), do: false
  defp still_relevant?("ended", %User{subscription_tier: "free"}), do: true
  defp still_relevant?("ended", _), do: false
end
