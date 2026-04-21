defmodule Inkwell.Workers.GazetteHashtagPollingWorker do
  @moduledoc """
  Polls one Mastodon instance's public hashtag timeline and ingests matching
  statuses as `remote_entries` tagged `source: "hashtag"` so the Gazette can
  surface them.

  One job per `{instance, hashtag}` pair. The Gazette ingestion scheduler
  fans out a batch of these at the top of each cron tick, staggered so we
  don't burst against any single upstream instance.

  Failures (HTTP errors, rate limits) are logged and treated as soft failures
  — the next scheduler tick will enqueue a fresh job, so there's no value in
  Oban retrying in-cycle.
  """

  use Oban.Worker,
    queue: :gazette_ingestion,
    max_attempts: 1,
    priority: 5

  require Logger

  alias Inkwell.Federation.Http
  alias Inkwell.Gazette.MastodonStatusMapper

  # Mastodon default cap is 40 for public timelines.
  @per_page 40

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"instance" => instance, "hashtag" => hashtag} = args}) do
    topic = Map.get(args, "topic")
    url = "https://#{instance}/api/v1/timelines/tag/#{URI.encode(hashtag)}?limit=#{@per_page}"

    headers = [
      {~c"accept", ~c"application/json"}
    ]

    started_at = System.monotonic_time(:millisecond)

    case Http.get(url, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        handle_body(body, instance, topic, hashtag, started_at)

      {:ok, {status, _}} ->
        Logger.warning(
          "GazetteHashtagPollingWorker: HTTP #{status} from #{instance} for ##{hashtag}"
        )

        :ok

      {:error, reason} ->
        Logger.warning(
          "GazetteHashtagPollingWorker: fetch failed from #{instance} for ##{hashtag}: #{inspect(reason)}"
        )

        :ok
    end
  end

  defp handle_body(body, instance, topic, hashtag, started_at) do
    case Jason.decode(body) do
      {:ok, statuses} when is_list(statuses) ->
        results = Enum.map(statuses, &MastodonStatusMapper.process_status/1)
        summarize(results, instance, topic, hashtag, length(statuses), started_at)
        :ok

      {:ok, _other} ->
        Logger.warning(
          "GazetteHashtagPollingWorker: expected array from #{instance}/tag/#{hashtag}, got a non-list response"
        )

        :ok

      {:error, reason} ->
        Logger.warning(
          "GazetteHashtagPollingWorker: JSON decode failed from #{instance}/tag/#{hashtag}: #{inspect(reason)}"
        )

        :ok
    end
  end

  defp summarize(results, instance, topic, hashtag, fetched, started_at) do
    stored = Enum.count(results, &(&1 == :stored))
    skipped = Enum.count(results, &(&1 == :skipped))
    errored = Enum.count(results, &match?({:error, _}, &1))
    duration_ms = System.monotonic_time(:millisecond) - started_at

    Logger.info(
      "GazetteHashtagPollingWorker: #{instance} ##{hashtag} (#{topic || "?"}) — fetched #{fetched}, stored #{stored}, skipped #{skipped}, errored #{errored} in #{duration_ms}ms"
    )
  end
end
