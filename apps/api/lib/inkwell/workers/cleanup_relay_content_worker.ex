defmodule Inkwell.Workers.CleanupRelayContentWorker do
  @moduledoc """
  Deletes relay-sourced remote entries older than 14 days.
  Relay content has a shorter TTL than follow-sourced content.
  Scheduled via Oban cron to run daily at 5:15am UTC.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Federation.RemoteEntries.cleanup_relay_entries()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} old relay entry/entries")
    end

    :ok
  end
end
