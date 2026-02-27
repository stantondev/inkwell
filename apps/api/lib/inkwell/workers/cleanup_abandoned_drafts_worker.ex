defmodule Inkwell.Workers.CleanupAbandonedDraftsWorker do
  @moduledoc """
  Deletes draft entries that haven't been updated in 365 days.
  Scheduled via Oban cron to run daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Journals.cleanup_abandoned_drafts()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} abandoned draft(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_abandoned_drafts)
    :ok
  end
end
