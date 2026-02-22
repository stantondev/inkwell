defmodule Inkwell.Workers.CleanupExpiredTokensWorker do
  @moduledoc """
  Periodically deletes expired auth tokens (magic link + API session).
  Scheduled via Oban cron to run once per day.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Auth.cleanup_expired_tokens()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} expired auth token(s)")
    end

    :ok
  end
end
