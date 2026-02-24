defmodule Inkwell.Workers.CleanupExpiredImportsWorker do
  @moduledoc """
  Cron worker that deletes expired and stuck data import records.
  Runs daily at 6:30am UTC.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Import.cleanup_expired_imports()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} expired data import(s)")
    end

    :ok
  end
end
