defmodule Inkwell.Workers.CleanupRelayContentWorker do
  @moduledoc """
  Deletes ephemeral-source remote entries (relay- and hashtag-sourced) older
  than 14 days. These discovery/Gazette sources have a shorter TTL than
  follow-sourced content. Then drops cached fediverse actors nothing refers to
  any more (`RemoteActor.prune_unused/1`), most of which those entries brought in.
  Scheduled via Oban cron to run daily at 5:15am UTC.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    {:ok, count} = Inkwell.Federation.RemoteEntries.cleanup_relay_entries()

    if count > 0 do
      Logger.info("Cleaned up #{count} old relay/hashtag entry/entries")
    end

    actors = Inkwell.Federation.RemoteActor.prune_unused()

    if actors > 0 do
      Logger.info("Pruned #{actors} unused cached remote actor(s)")
    end

    :ok
  end
end
