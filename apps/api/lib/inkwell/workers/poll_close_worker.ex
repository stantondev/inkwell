defmodule Inkwell.Workers.PollCloseWorker do
  @moduledoc """
  Oban cron worker that runs every minute to automatically close polls
  whose `closes_at` timestamp has passed.
  """
  use Oban.Worker, queue: :default, max_attempts: 1

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Polls.Poll

  @impl Oban.Worker
  def perform(_job) do
    now = DateTime.utc_now()

    {count, _} =
      from(p in Poll,
        where: p.status == :open,
        where: not is_nil(p.closes_at),
        where: p.closes_at <= ^now
      )
      |> Repo.update_all(set: [status: :closed, closed_at: now])

    if count > 0 do
      require Logger
      Logger.info("[PollCloseWorker] Auto-closed #{count} poll(s)")
    end

    :ok
  end
end
