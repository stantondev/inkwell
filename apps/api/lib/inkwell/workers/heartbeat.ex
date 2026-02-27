defmodule Inkwell.Workers.Heartbeat do
  @moduledoc """
  Sends heartbeat pings to Healthchecks.io after successful Oban cron worker runs.

  Each cron worker calls `Heartbeat.ping(:worker_key)` at the end of its `perform/1`.
  The ping URL for each worker is read from application config, set via environment
  variables in `runtime.exs`.

  If no URL is configured for a given worker key (e.g. in dev/test), the ping is
  silently skipped.

  ## Usage

      # At the end of a worker's perform/1:
      Inkwell.Workers.Heartbeat.ping(:cleanup_expired_tokens)

  ## How It Works

  1. Worker runs its job successfully
  2. Calls `Heartbeat.ping/1` with its key
  3. Heartbeat fires an async HTTP GET to the Healthchecks.io ping URL
  4. If the ping doesn't arrive within the expected window, Healthchecks.io alerts via Slack

  The ping is async (Task.start) so it never blocks or affects the worker's return value.
  Failures to ping are logged as warnings but don't cause the worker to fail.
  """

  require Logger

  @doc """
  Pings the Healthchecks.io URL for the given worker key.

  ## Worker Keys

  - `:cleanup_expired_tokens` — daily 3am UTC
  - `:cleanup_orphaned_images` — daily 4am UTC
  - `:cleanup_read_notifications` — daily 4:30am UTC
  - `:cleanup_abandoned_drafts` — daily 5am UTC
  - `:cleanup_remote_entries` — daily 5:30am UTC
  - `:cleanup_expired_exports` — daily 6am UTC
  - `:cleanup_expired_imports` — daily 6:30am UTC
  - `:cleanup_unconfirmed_subscribers` — daily 7am UTC
  - `:newsletter_schedule` — every 5 minutes
  """
  @spec ping(atom()) :: :ok
  def ping(worker_key) when is_atom(worker_key) do
    healthchecks = Application.get_env(:inkwell, :healthchecks, %{})

    case Map.get(healthchecks, worker_key) do
      url when is_binary(url) and url != "" ->
        Task.start(fn ->
          case :httpc.request(:get, {String.to_charlist(url), []}, [timeout: 10_000], []) do
            {:ok, {{_, status, _}, _, _}} when status in 200..299 ->
              Logger.debug("Heartbeat ping OK for #{worker_key}")

            {:ok, {{_, status, _}, _, _}} ->
              Logger.warning("Heartbeat ping for #{worker_key} returned HTTP #{status}")

            {:error, reason} ->
              Logger.warning("Heartbeat ping failed for #{worker_key}: #{inspect(reason)}")
          end
        end)

        :ok

      _ ->
        # No URL configured — skip silently (expected in dev/test)
        :ok
    end
  end
end
