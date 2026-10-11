defmodule Inkwell.Workers.CleanupAbandonedDraftsWorker do
  @moduledoc """
  Clears completely empty drafts that haven't been touched in 30 days.
  Drafts with anything in them are kept.
  Scheduled via Oban cron to run daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Journals.cleanup_abandoned_drafts()

    if count > 0 do
      require Logger
      Logger.info("Cleared #{count} empty draft(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_abandoned_drafts)
    :ok
  end
end
