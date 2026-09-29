defmodule Inkwell.Workers.DatabaseMemoryWorker do
  @moduledoc """
  Hourly: warn on Slack before the database machine runs out of memory.

  On 2026-09-29 the 512 MB `inkwell-db` machine ran out of memory, Linux
  killed a Postgres process, and the site froze for six minutes with 503s.
  Free memory had been sliding for two weeks and nothing said so. This asks
  Fly's metrics for the machine's lowest free memory over the past hour and
  posts to #alerts when it drops under the threshold (100 MB), at most once a
  day, with the command to upgrade.

  The API can't see the database machine's memory itself, so it reads Fly's
  Prometheus with a read-only org token (`FLY_METRICS_TOKEN`). Without that
  token (local dev, self-hosted) the check does nothing.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @mb 1024 * 1024
  # One alert per day while memory stays low; the hourly check keeps running.
  @alert_every 22 * 60 * 60

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"kind" => "alert", "text" => text}}) do
    Inkwell.Slack.notify(text)
    :ok
  end

  def perform(_job) do
    with {:ok, config} <- config(),
         {:ok, reading} <- reading(config) do
      case evaluate(reading, config.threshold_mb, config.app) do
        {:alert, text} ->
          # Unique on args.kind only, so the hourly check jobs (args %{}) never match.
          %{"kind" => "alert", "text" => text}
          |> new(unique: [period: @alert_every, fields: [:worker, :args], keys: [:kind], states: :all])
          |> Oban.insert()

          :ok

        :ok ->
          :ok
      end
    else
      :disabled ->
        :ok

      {:error, reason} ->
        # Don't alert on a failed read: Fly's metrics blip now and then.
        Logger.warning("[DatabaseMemory] couldn't read Fly metrics: #{inspect(reason)}")
        :ok
    end
  end

  @doc """
  Decide whether a reading deserves an alert. `reading` has `:available` and
  `:total` in bytes (total may be nil) and `:instance` (the machine id).
  """
  def evaluate(%{available: available} = reading, threshold_mb, app) do
    available_mb = div(available, @mb)

    if available_mb < threshold_mb do
      {:alert, message(available_mb, reading, app)}
    else
      :ok
    end
  end

  defp message(available_mb, reading, app) do
    total_mb = if reading[:total], do: div(reading.total, @mb)
    # Fly sizes machines in 256 MB steps; double what it has now.
    next_mb = if total_mb, do: next_size(total_mb), else: 2048
    machine = reading[:instance] || "<machine id>"

    of_total = if total_mb, do: " of #{total_mb} MB", else: ""

    """
    :warning: *The database is running low on memory — time to give it more.*
    The lowest free memory on #{app} in the past hour was *#{available_mb} MB*#{of_total}. \
    When it reaches almost nothing, Postgres gets killed and the site freezes with errors \
    for a few minutes (that happened on Sep 29, 2026).

    To upgrade (about 40 seconds of downtime, roughly $5/month more per extra GB):
    `fly machine update #{machine} --vm-memory #{next_mb} -a #{app}`
    Then update the Fly line in `transparency_costs` (apps/api/config/config.exs).
    """
  end

  defp next_size(total_mb) do
    # A 1 GB machine reports ~962 MB, so round up to the size it was sold as.
    sold_as = div(total_mb + 255, 256) * 256
    sold_as * 2
  end

  defp config do
    case Application.get_env(:inkwell, :db_memory_alert) do
      %{token: token} = config when is_binary(token) and token != "" -> {:ok, config}
      _ -> :disabled
    end
  end

  @doc """
  The database machine's lowest free memory in the past hour, straight from
  Fly: `{:ok, %{available: bytes, total: bytes | nil, instance: id}}`.
  Handy for a manual check: `Inkwell.Workers.DatabaseMemoryWorker.reading()`.
  """
  def reading do
    with {:ok, config} <- config(), do: reading(config)
  end

  defp reading(config) do
    selector = ~s({app="#{config.app}"})

    with {:ok, available} <-
           query(config, "min_over_time(fly_instance_memory_mem_available#{selector}[1h])") do
      total =
        case query(config, "max_over_time(fly_instance_memory_mem_total#{selector}[1h])") do
          {:ok, %{value: value}} -> value
          _ -> nil
        end

      {:ok, %{available: available.value, total: total, instance: available.instance}}
    end
  end

  # Lowest value across the app's machines (there is one today).
  defp query(config, promql) do
    url =
      "#{config.prometheus_url}/api/v1/query?" <> URI.encode_query(%{"query" => promql})

    # Read-only tokens from `fly tokens create` already start with "FlyV1 ".
    auth =
      if String.starts_with?(config.token, "FlyV1 "), do: config.token, else: "Bearer #{config.token}"

    request = {String.to_charlist(url), [{~c"authorization", String.to_charlist(auth)}]}

    case :httpc.request(:get, request, [ssl: Inkwell.SSL.httpc_opts(), timeout: 15_000], []) do
      {:ok, {{_, 200, _}, _headers, body}} ->
        with {:ok, %{"data" => %{"result" => [_ | _] = results}}} <-
               Jason.decode(:erlang.list_to_binary(body)) do
          %{"metric" => metric, "value" => [_ts, value]} =
            Enum.min_by(results, fn %{"value" => [_, v]} -> parse_number(v) end)

          {:ok, %{value: parse_number(value), instance: metric["instance"]}}
        else
          {:ok, _} -> {:error, :no_data}
          error -> error
        end

      {:ok, {{_, status, _}, _headers, body}} ->
        {:error, {:http, status, body |> :erlang.list_to_binary() |> String.slice(0, 200)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp parse_number(value) do
    {number, _} = Float.parse(value)
    trunc(number)
  end
end
