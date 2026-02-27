defmodule Inkwell.Workers.CleanupOrphanedImagesWorker do
  @moduledoc """
  Deletes entry_images older than 24 hours that are not referenced in any
  entry's body_html. Scheduled via Oban cron to run daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Journals.cleanup_orphaned_images()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} orphaned entry image(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_orphaned_images)
    :ok
  end
end
