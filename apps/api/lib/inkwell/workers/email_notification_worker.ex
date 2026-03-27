defmodule Inkwell.Workers.EmailNotificationWorker do
  @moduledoc """
  Oban worker that sends an email notification for a comment, reply, or mention.
  One job per notification (enqueued from Accounts.maybe_send_email_notification/2).
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Email

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    %{
      "user_id" => user_id,
      "actor_name" => actor_name,
      "type" => type,
      "entry_title" => entry_title,
      "entry_url" => entry_url
    } = args

    user = Repo.get(User, user_id)

    if is_nil(user) do
      Logger.debug("[EmailNotification] User #{user_id} not found, skipping")
      :ok
    else
      Email.send_comment_notification(user, actor_name, type, entry_title, entry_url)
    end
  end
end
