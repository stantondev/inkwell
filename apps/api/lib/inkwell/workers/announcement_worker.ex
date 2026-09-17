defmodule Inkwell.Workers.AnnouncementWorker do
  @moduledoc "Delivers one founder announcement email to one user."

  # Unique for 30 days per user + subject: re-queuing the same announcement
  # (double-click, retry, redeploy) never sends anyone a second copy.
  use Oban.Worker,
    queue: :default,
    max_attempts: 3,
    unique: [period: 30 * 24 * 3600, keys: [:user_id, :subject], states: :all]

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => id, "subject" => subject, "body" => body}}) do
    case Repo.get(User, id) do
      nil ->
        :ok

      %User{blocked_at: blocked} when not is_nil(blocked) ->
        :ok

      %User{settings: %{"email_notifications_disabled" => true}} ->
        # Unsubscribed after the job was queued.
        :ok

      user ->
        case Inkwell.Email.send_announcement(user, subject, body) do
          {:ok, _} -> :ok
          :ok -> :ok
          {:error, reason} ->
            Logger.warning("[Announcement] send failed for #{id}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end
end
