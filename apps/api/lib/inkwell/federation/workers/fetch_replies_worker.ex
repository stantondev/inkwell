defmodule Inkwell.Federation.Workers.FetchRepliesWorker do
  @moduledoc """
  Background worker that fetches reply threads from fediverse servers for remote entries.

  Triggered when a user views comments on a remote entry and the replies haven't been
  fetched recently (15-minute TTL). Uses Oban's unique constraint to prevent duplicate
  jobs for the same entry within a 5-minute window.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 2,
    priority: 3,
    unique: [period: 300, keys: [:remote_entry_id]]

  alias Inkwell.Federation.{RemoteEntries, ReplyFetcher}

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"remote_entry_id" => remote_entry_id}}) do
    case RemoteEntries.get_remote_entry(remote_entry_id) do
      nil ->
        Logger.debug("FetchRepliesWorker: remote entry #{remote_entry_id} not found, skipping")
        :ok

      remote_entry ->
        case ReplyFetcher.fetch_replies(remote_entry) do
          :ok ->
            :ok

          {:error, reason} ->
            Logger.warning("FetchRepliesWorker: failed for #{remote_entry_id}: #{inspect(reason)}")
            # Return :ok to avoid retrying on transient federation failures.
            # The next user request after the TTL expires will trigger a new fetch.
            :ok
        end
    end
  end
end
