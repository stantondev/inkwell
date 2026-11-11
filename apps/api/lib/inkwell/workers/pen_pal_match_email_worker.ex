defmodule Inkwell.Workers.PenPalMatchEmailWorker do
  @moduledoc """
  One email to the member who was waiting in the pen pal exchange when their
  match arrived. Skipped for accounts that can't or don't want email.
  """
  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 3600, keys: [:user_id, :conversation_id]]

  alias Inkwell.{Email, PenPalExchange, Repo}
  alias Inkwell.Accounts.User
  alias Inkwell.Billing.Trials

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => user_id, "partner_id" => partner_id, "conversation_id" => conversation_id}}) do
    with %User{} = user <- Repo.get(User, user_id),
         %User{} = partner <- Repo.get(User, partner_id),
         true <- Trials.emailable?(user) do
      {subject, body} = PenPalExchange.email_content(user, partner, conversation_id)
      Email.send_announcement(user, subject, body)
    end

    :ok
  end
end
