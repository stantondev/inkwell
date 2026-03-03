defmodule Inkwell.Workers.VerifyRemoteEntriesWorker do
  @moduledoc """
  Periodically verifies that remote (fediverse) entries still exist at their source.
  Entries returning 404 or 410 are deleted locally (with FK cascade for stamps,
  comments, and inks). Entries returning 5xx or network errors are skipped.

  Runs every 4 hours via Oban cron. Processes up to 50 entries per run,
  prioritizing never-verified entries then oldest-verified entries.
  """

  use Oban.Worker, queue: :federation, max_attempts: 1

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    entries = Inkwell.Federation.RemoteEntries.list_entries_needing_verification(50)

    if entries == [] do
      Logger.debug("No remote entries need verification")
    else
      results = Inkwell.Federation.RemoteEntries.verify_and_cleanup_batch(entries)

      if results.deleted > 0 or results.verified > 0 do
        Logger.info(
          "Remote entry verification: #{results.verified} verified, " <>
            "#{results.deleted} deleted, #{results.skipped} skipped"
        )
      end
    end

    :ok
  end
end
