defmodule Inkwell.Metrics.Pusher do
  @moduledoc """
  GenServer that collects system metrics every 60 seconds and pushes them
  to Grafana Cloud via the OpenTelemetry (OTLP) HTTP JSON endpoint.

  ## How it works

  1. Every 60 seconds, collects metrics from:
     - BEAM VM (memory breakdown, process count, schedulers, run queue)
     - PostgreSQL (active connections)
     - Oban (job queue depths by state)
     - Phoenix HTTP (request count, avg latency, counts by status class)
  2. Formats as OTLP JSON (application/json — no protobuf, no extra deps)
  3. POSTs to Grafana Cloud's OTLP gateway endpoint

  ## Configuration (via Fly secrets → runtime.exs)

      config :inkwell, :grafana, %{
        metrics_url: "https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/metrics",
        metrics_user: "123456",    # Grafana Cloud instance/stack ID
        api_key: "glc_eyJ..."      # API key with MetricsPublisher role
      }

  If not configured, the GenServer returns `:ignore` and doesn't start.

  ## Querying in Grafana (PromQL)

      beam_memory_total             — total BEAM VM memory in bytes
      beam_memory_processes         — processes memory
      beam_info_process_count       — number of Erlang processes
      beam_info_run_queue           — scheduler run queue length
      db_connections_active         — active Postgres connections
      oban_jobs_available           — jobs ready to run
      oban_jobs_executing           — jobs currently running
      http_requests_total           — requests per 60s interval
      http_requests_avg_ms          — average request latency
      http_requests_status_5xx      — 5xx error count per interval
  """

  use GenServer
  require Logger

  @push_interval_ms 60_000

  # -------------------------------------------------------------------
  # GenServer lifecycle
  # -------------------------------------------------------------------

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    config = Application.get_env(:inkwell, :grafana, %{})

    url = Map.get(config, :metrics_url)
    user = Map.get(config, :metrics_user)
    key = Map.get(config, :api_key)

    if is_binary(url) and url != "" and is_binary(user) and is_binary(key) do
      Logger.info(
        "Metrics pusher started — pushing to Grafana Cloud every #{div(@push_interval_ms, 1000)}s"
      )

      # Push first batch after a short delay (let the app fully boot)
      Process.send_after(self(), :push, 5_000)
      auth = Base.encode64("#{user}:#{key}")
      {:ok, %{url: url, auth: auth}}
    else
      Logger.info("Metrics pusher disabled — GRAFANA_METRICS_URL not configured")
      :ignore
    end
  end

  @impl true
  def handle_info(:push, state) do
    push_metrics(state)
    Process.send_after(self(), :push, @push_interval_ms)
    {:noreply, state}
  end

  # -------------------------------------------------------------------
  # Metric collection → OTLP JSON payload
  # -------------------------------------------------------------------

  defp build_otlp_payload do
    ts_ns = System.system_time(:nanosecond)

    metrics =
      beam_memory_metrics(ts_ns) ++
        beam_info_metrics(ts_ns) ++
        db_metrics(ts_ns) ++
        oban_metrics(ts_ns) ++
        http_metrics(ts_ns)

    %{
      "resourceMetrics" => [
        %{
          "resource" => %{
            "attributes" => [
              %{"key" => "service.name", "value" => %{"stringValue" => "inkwell-api"}},
              %{
                "key" => "deployment.environment",
                "value" => %{"stringValue" => "production"}
              }
            ]
          },
          "scopeMetrics" => [
            %{
              "scope" => %{"name" => "inkwell.metrics", "version" => "1.0"},
              "metrics" => metrics
            }
          ]
        }
      ]
    }
  end

  # Builds a single OTLP gauge metric with one data point.
  defp gauge(name, value, ts_ns) do
    %{
      "name" => name,
      "gauge" => %{
        "dataPoints" => [
          %{
            "timeUnixNano" => to_string(ts_ns),
            "asDouble" => value * 1.0
          }
        ]
      }
    }
  end

  defp beam_memory_metrics(ts_ns) do
    mem = :erlang.memory()

    [
      gauge("beam_memory_total", mem[:total], ts_ns),
      gauge("beam_memory_processes", mem[:processes], ts_ns),
      gauge("beam_memory_ets", mem[:ets], ts_ns),
      gauge("beam_memory_binary", mem[:binary], ts_ns),
      gauge("beam_memory_atom", mem[:atom], ts_ns),
      gauge("beam_memory_system", mem[:system], ts_ns)
    ]
  end

  defp beam_info_metrics(ts_ns) do
    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    run_queue = :erlang.statistics(:total_run_queue_lengths_all)

    [
      gauge("beam_info_process_count", :erlang.system_info(:process_count), ts_ns),
      gauge("beam_info_port_count", :erlang.system_info(:port_count), ts_ns),
      gauge("beam_info_atom_count", :erlang.system_info(:atom_count), ts_ns),
      gauge("beam_info_scheduler_count", :erlang.system_info(:schedulers_online), ts_ns),
      gauge("beam_info_uptime_seconds", div(uptime_ms, 1000), ts_ns),
      gauge("beam_info_run_queue", run_queue, ts_ns)
    ]
  end

  defp db_metrics(ts_ns) do
    case Ecto.Adapters.SQL.query(
           Inkwell.Repo,
           "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()",
           []
         ) do
      {:ok, %{rows: [[count]]}} ->
        [gauge("db_connections_active", count, ts_ns)]

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp oban_metrics(ts_ns) do
    query = """
    SELECT state, count(*)
    FROM oban_jobs
    WHERE state IN ('available', 'executing', 'retryable', 'scheduled')
    GROUP BY state
    """

    case Ecto.Adapters.SQL.query(Inkwell.Repo, query, []) do
      {:ok, %{rows: rows}} ->
        stats = Map.new(rows, fn [state, count] -> {state, count} end)

        [
          gauge("oban_jobs_available", Map.get(stats, "available", 0), ts_ns),
          gauge("oban_jobs_executing", Map.get(stats, "executing", 0), ts_ns),
          gauge("oban_jobs_retryable", Map.get(stats, "retryable", 0), ts_ns),
          gauge("oban_jobs_scheduled", Map.get(stats, "scheduled", 0), ts_ns)
        ]

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp http_metrics(ts_ns) do
    stats = Inkwell.Metrics.HttpTracker.collect_and_reset()

    [
      gauge("http_requests_total", stats.total_requests, ts_ns),
      gauge("http_requests_duration_ms", stats.total_duration_ms, ts_ns),
      gauge("http_requests_avg_ms", stats.avg_duration_ms, ts_ns),
      gauge("http_requests_status_2xx", stats.status_2xx, ts_ns),
      gauge("http_requests_status_3xx", stats.status_3xx, ts_ns),
      gauge("http_requests_status_4xx", stats.status_4xx, ts_ns),
      gauge("http_requests_status_5xx", stats.status_5xx, ts_ns)
    ]
  end

  # -------------------------------------------------------------------
  # Push to Grafana Cloud OTLP endpoint
  # -------------------------------------------------------------------

  defp push_metrics(%{url: url, auth: auth}) do
    payload = build_otlp_payload()
    body = Jason.encode!(payload)

    headers = [
      {~c"authorization", String.to_charlist("Basic #{auth}")}
    ]

    case :httpc.request(
           :post,
           {String.to_charlist(url), headers, ~c"application/json",
            String.to_charlist(body)},
           [timeout: 10_000],
           []
         ) do
      {:ok, {{_, status, _}, _, _}} when status in 200..299 ->
        Logger.debug("Metrics pushed to Grafana Cloud (#{status})")

      {:ok, {{_, status, _}, _, resp_body}} ->
        Logger.warning(
          "Metrics push returned HTTP #{status}: #{inspect(resp_body |> to_string() |> String.slice(0, 200))}"
        )

      {:error, reason} ->
        Logger.warning("Metrics push failed: #{inspect(reason)}")
    end
  rescue
    e ->
      Logger.warning("Metrics push error: #{Exception.message(e)}")
  end
end
