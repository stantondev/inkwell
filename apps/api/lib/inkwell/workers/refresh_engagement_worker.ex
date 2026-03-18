defmodule Inkwell.Workers.RefreshEngagementWorker do
  @moduledoc """
  Oban cron worker that periodically re-fetches AP objects for recent remote entries
  and updates their engagement counts (likes, boosts, replies).

  Runs every 2 hours. Processes up to 100 entries per run, targeting entries
  published in the last 7 days that haven't been refreshed recently.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 1,
    unique: [period: 300]

  alias Inkwell.Federation.RemoteEntries

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    entries = RemoteEntries.list_entries_needing_engagement_refresh(100)

    if entries == [] do
      Logger.info("RefreshEngagementWorker: no entries need refresh")
      :ok
    else
      Logger.info("RefreshEngagementWorker: refreshing engagement for #{length(entries)} entries")
      results = RemoteEntries.refresh_engagement_batch(entries)
      Logger.info("RefreshEngagementWorker: done — refreshed=#{results.refreshed}, skipped=#{results.skipped}, errors=#{results.errors}")
      :ok
    end
  end
end
