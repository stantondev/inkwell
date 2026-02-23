defmodule Inkwell.Workers.CleanupRemoteEntriesWorker do
  @moduledoc """
  Deletes remote entries older than 90 days.
  Associated stamps and comments are cascade-deleted via FK.
  Scheduled via Oban cron to run daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Federation.RemoteEntries.cleanup_old_entries()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} old remote entry/entries")
    end

    :ok
  end
end
