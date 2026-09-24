defmodule Inkwell.Workers.GazetteWorker do
  @moduledoc """
  Keeps the Gazette current.

    * `"ingest"` (hourly): reads the fediverse's trending links into
      `gazette_stories`, publishes a first edition if there is none yet, and
      tidies old stories and editions.
    * `"edition"` (11:05 and 22:05 UTC, about 7am and 6pm US Eastern): reads
      the trends once more, then publishes the next numbered edition.

  Off unless GAZETTE_INGESTION_ENABLED=true (the same switch as before).
  """

  use Oban.Worker, queue: :gazette_ingestion, max_attempts: 2, unique: [period: 600]

  require Logger

  alias Inkwell.Gazette.{Editions, Trends}

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(3)

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"task" => task}}) do
    if Application.get_env(:inkwell, :gazette_ingestion_enabled, false) == true do
      run(task)
    else
      :ok
    end
  end

  def perform(_job), do: :ok

  defp run("ingest") do
    Trends.ingest()
    Editions.ensure_one()
    Trends.prune()
    Editions.prune()
    :ok
  end

  defp run("edition") do
    Trends.ingest()

    case Editions.publish() do
      {:ok, edition} ->
        Logger.info("Gazette: published edition No. #{edition.number} (#{edition.story_count} stories)")

      {:error, reason} ->
        Logger.warning("Gazette: no edition published: #{inspect(reason)}")
    end

    :ok
  end

  defp run(_), do: :ok
end
