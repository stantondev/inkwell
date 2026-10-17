defmodule Inkwell.Workers.ThankYouEmailWorker do
  @moduledoc "Sends one thank-you note after a payment. Queued by `Inkwell.Billing.ThankYou`."

  use Oban.Worker,
    queue: :default,
    max_attempts: 3,
    unique: [period: 365 * 24 * 3600, keys: [:user_id, :kind, :ref], states: :all]

  alias Inkwell.Accounts.User
  alias Inkwell.Billing.ThankYou
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => user_id, "kind" => kind} = args}) do
    with %User{} = user <- Repo.get(User, user_id),
         true <- Inkwell.Billing.Trials.emailable?(user) do
      {subject, body} = ThankYou.email_content(kind, user, args["amount_cents"])

      case Inkwell.Email.send_announcement(user, subject, body, replyable: true) do
        {:ok, _} ->
          Logger.info("[ThankYou] Sent #{kind} note to @#{user.username}")
          :ok

        {:error, reason} ->
          {:error, reason}
      end
    else
      _ -> :ok
    end
  end
end
