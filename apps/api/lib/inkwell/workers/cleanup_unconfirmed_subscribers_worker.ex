defmodule Inkwell.Workers.CleanupUnconfirmedSubscribersWorker do
  @moduledoc """
  Oban cron worker that deletes pending newsletter subscribers older than 7 days.
  Runs daily at 7am UTC.
  """
  use Oban.Worker, queue: :default, max_attempts: 1

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Newsletter.Subscriber

  @impl Oban.Worker
  def perform(_job) do
    cutoff = DateTime.add(DateTime.utc_now(), -7, :day)

    {count, _} =
      Subscriber
      |> where([s], s.status == "pending" and s.inserted_at < ^cutoff)
      |> Repo.delete_all()

    if count > 0 do
      require Logger
      Logger.info("Cleaned up #{count} unconfirmed newsletter subscribers")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_unconfirmed_subscribers)
    :ok
  end
end
