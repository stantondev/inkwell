defmodule Inkwell.Workers.MuseWorker do
  @moduledoc """
  Oban cron worker for the Inkwell Muse content bot.

  Three separate cron entries call this worker with different `type` args:
  - "daily_prompt" — 9am UTC daily: Claude-generated writing prompt
  - "weekly_roundup" — Sunday 10am UTC: auto-generated from DB stats
  - "monthly_update" — 1st of month 11am UTC: Claude-assisted community update

  If MUSE_ENABLED is not "true", the worker silently no-ops.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  alias Inkwell.Muse

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"type" => type}}) do
    unless Muse.enabled?() do
      Logger.debug("[Muse] Disabled, skipping #{type}")
      :ok
    else
      run_task(type)
    end
  end

  # Fallback for jobs without a type arg (shouldn't happen with cron config)
  def perform(%Oban.Job{}) do
    unless Muse.enabled?() do
      :ok
    else
      run_task("daily_prompt")
    end
  end

  defp run_task("daily_prompt") do
    Logger.info("[Muse] Running daily writing prompt")

    case Muse.create_daily_prompt() do
      {:ok, _entry} -> :ok
      {:error, reason} ->
        Logger.error("[Muse] Daily prompt failed: #{inspect(reason)}")
        :ok
    end
  end

  defp run_task("weekly_roundup") do
    Logger.info("[Muse] Running weekly roundup")

    case Muse.create_weekly_roundup() do
      {:ok, _entry} -> :ok
      {:error, reason} ->
        Logger.error("[Muse] Weekly roundup failed: #{inspect(reason)}")
        :ok
    end
  end

  defp run_task("monthly_update") do
    Logger.info("[Muse] Running monthly community update")

    case Muse.create_monthly_update() do
      {:ok, _entry} -> :ok
      {:error, reason} ->
        Logger.error("[Muse] Monthly update failed: #{inspect(reason)}")
        :ok
    end
  end

  defp run_task(unknown) do
    Logger.warning("[Muse] Unknown task type: #{unknown}")
    :ok
  end
end
