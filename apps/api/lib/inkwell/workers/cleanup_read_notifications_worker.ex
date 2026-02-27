defmodule Inkwell.Workers.CleanupReadNotificationsWorker do
  @moduledoc """
  Deletes read notifications older than 90 days.
  Scheduled via Oban cron to run daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Accounts.cleanup_read_notifications()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} old read notification(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_read_notifications)
    :ok
  end
end
