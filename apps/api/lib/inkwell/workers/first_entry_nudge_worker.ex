defmodule Inkwell.Workers.FirstEntryNudgeWorker do
  @moduledoc """
  Daily cron (no args): queues the "your first page" email for everyone due.
  With a user_id: sends it to that one person. See `Inkwell.FirstEntryNudge`.
  """

  # Uniqueness is set per send job in FirstEntryNudge.enqueue_due/0, not here:
  # the daily cron job has no user_id, so a worker-wide rule would make every
  # cron run after the first a "duplicate" for 30 days.
  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Accounts.User
  alias Inkwell.FirstEntryNudge
  alias Inkwell.Repo

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => user_id}}) do
    case Repo.get(User, user_id) do
      %User{} = user ->
        case FirstEntryNudge.deliver(user) do
          {:error, reason} -> {:error, reason}
          _ -> :ok
        end

      nil ->
        :ok
    end
  end

  def perform(%Oban.Job{}) do
    FirstEntryNudge.enqueue_due()
    :ok
  end
end
