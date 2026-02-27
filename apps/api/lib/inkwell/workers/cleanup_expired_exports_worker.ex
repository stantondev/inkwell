defmodule Inkwell.Workers.CleanupExpiredExportsWorker do
  @moduledoc """
  Deletes expired data exports (48h after completion) and stuck exports
  (pending/processing for more than 24h). Scheduled via Oban cron daily.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Export.cleanup_expired_exports()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} expired data export(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_expired_exports)
    :ok
  end
end
