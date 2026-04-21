defmodule Inkwell.Workers.GazetteIngestionScheduler do
  @moduledoc """
  Oban cron worker that fans out one `GazetteHashtagPollingWorker` job per
  `{instance, topic}` pair every 30 minutes.

  Each topic in `Inkwell.Gazette.Topics` has multiple associated hashtags.
  Polling every hashtag on every cycle would generate too many outbound
  requests, so we rotate through hashtags deterministically: per cycle, each
  topic contributes exactly one hashtag, selected by the current minute-of-day
  modulo the number of hashtags for that topic. Over the course of a few
  hours the rotation covers the full hashtag list.

  Output volume (with defaults): 24 topics × 5 instances = 120 jobs per tick,
  drained by the `:gazette_ingestion` queue at `concurrency: 3`. With the
  queue concurrency plus Http.get's per-domain rate limiting, this finishes
  well inside the 30-minute window.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  alias Inkwell.Gazette.{Sources, Topics}
  alias Inkwell.Workers.GazetteHashtagPollingWorker

  @impl Oban.Worker
  def perform(_job) do
    # Kill switch. When this env var is not "true", the scheduler no-ops.
    # Lets ops flip ingestion off without a deploy if something looks wrong
    # in prod: `fly secrets unset GAZETTE_INGESTION_ENABLED` and wait <60s.
    if enabled?() do
      run()
    else
      Logger.debug("GazetteIngestionScheduler: disabled (GAZETTE_INGESTION_ENABLED not 'true'), skipping tick")
      :ok
    end
  end

  defp enabled? do
    Application.get_env(:inkwell, :gazette_ingestion_enabled, false) == true
  end

  defp run do
    instances = Sources.instances()
    rotation_index = rotation_index()

    jobs =
      for topic_id <- Topics.topic_ids(),
          hashtag = pick_hashtag(topic_id, rotation_index),
          hashtag != nil,
          instance <- instances do
        %{"instance" => instance, "topic" => topic_id, "hashtag" => hashtag}
      end

    inserted =
      jobs
      |> Enum.map(&GazetteHashtagPollingWorker.new(&1))
      |> Enum.map(fn changeset ->
        case Oban.insert(changeset) do
          {:ok, _job} -> :ok
          {:error, reason} ->
            Logger.warning("GazetteIngestionScheduler: failed to insert job: #{inspect(reason)}")
            :error
        end
      end)
      |> Enum.count(&(&1 == :ok))

    Logger.info("GazetteIngestionScheduler: enqueued #{inserted}/#{length(jobs)} polling jobs (#{length(instances)} instances)")
    :ok
  end

  # Pick one hashtag for the topic based on a rotation index so all hashtags
  # get exercised over a few hours without hammering the upstream instances.
  defp pick_hashtag(topic_id, rotation_index) do
    case Topics.hashtags_for_topic(topic_id) do
      [] -> nil
      hashtags -> Enum.at(hashtags, rem(rotation_index, length(hashtags)))
    end
  end

  # Minute-of-day as the rotation index. Cron fires every 30 minutes, so this
  # advances by 30 each tick — different enough to pick a new hashtag for
  # each topic on each tick while still being fully deterministic.
  defp rotation_index do
    now = DateTime.utc_now()
    now.hour * 60 + now.minute
  end
end
