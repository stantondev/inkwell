defmodule Inkwell.Metrics.HttpTracker do
  @moduledoc """
  Tracks HTTP request metrics via Phoenix telemetry events.

  Attaches to `[:phoenix, :endpoint, :stop]` and counts requests by status
  class (2xx, 3xx, 4xx, 5xx) with total duration. The Pusher calls
  `collect_and_reset/0` every 60 seconds to atomically read and clear counters.

  ## Metrics collected

  - `total_requests` — total HTTP requests in the interval
  - `total_duration_ms` — sum of all request durations in ms
  - `status_2xx` through `status_5xx` — counts by response status class
  """

  @ets_table :inkwell_http_metrics

  @doc """
  Creates the ETS table and attaches the telemetry handler.
  Call once from Application.start/2.
  """
  def setup do
    :ets.new(@ets_table, [:named_table, :public, :set, read_concurrency: true])

    :telemetry.attach(
      "inkwell-http-metrics",
      [:phoenix, :endpoint, :stop],
      &__MODULE__.handle_event/4,
      nil
    )
  end

  @doc false
  def handle_event(_event, %{duration: duration}, metadata, _config) do
    conn = Map.get(metadata, :conn, %{})
    status = Map.get(conn, :status, 0) || 0
    duration_ms = System.convert_time_unit(duration, :native, :millisecond)

    # Total counters
    :ets.update_counter(@ets_table, :total_requests, {2, 1}, {:total_requests, 0})
    :ets.update_counter(@ets_table, :total_duration_ms, {2, duration_ms}, {:total_duration_ms, 0})

    # By status class
    status_key =
      cond do
        status >= 500 -> :status_5xx
        status >= 400 -> :status_4xx
        status >= 300 -> :status_3xx
        status >= 200 -> :status_2xx
        true -> :status_other
      end

    :ets.update_counter(@ets_table, status_key, {2, 1}, {status_key, 0})
  rescue
    _ -> :ok
  end

  @doc """
  Atomically reads and resets all HTTP metric counters.
  Returns a map with the interval's metrics.
  """
  def collect_and_reset do
    total_requests = take_counter(:total_requests)
    total_duration = take_counter(:total_duration_ms)

    %{
      total_requests: total_requests,
      total_duration_ms: total_duration,
      avg_duration_ms: if(total_requests > 0, do: div(total_duration, total_requests), else: 0),
      status_2xx: take_counter(:status_2xx),
      status_3xx: take_counter(:status_3xx),
      status_4xx: take_counter(:status_4xx),
      status_5xx: take_counter(:status_5xx)
    }
  end

  defp take_counter(key) do
    case :ets.take(@ets_table, key) do
      [{_, value}] -> value
      [] -> 0
    end
  end
end
