defmodule InkwellWeb.HealthController do
  use InkwellWeb, :controller

  @app_start_time System.monotonic_time(:second)

  def check(conn, _params) do
    checks = %{
      database: check_database(),
      oban: check_oban()
    }

    overall =
      if Enum.all?(Map.values(checks), &healthy?/1), do: "ok", else: "degraded"

    status_code = if overall == "ok", do: 200, else: 503

    conn
    |> put_status(status_code)
    |> json(%{
      status: overall,
      checks: checks,
      uptime_seconds: System.monotonic_time(:second) - @app_start_time,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  def deep(conn, _params) do
    monitor_key = Application.get_env(:inkwell, :monitor_api_key)
    provided_key = get_req_header(conn, "x-monitor-key") |> List.first()

    # If MONITOR_API_KEY is set, require it; if not configured (dev), allow access
    key_configured? = is_binary(monitor_key) and monitor_key != ""
    authorized? = !key_configured? or provided_key == monitor_key

    if !authorized? do
      conn |> put_status(401) |> json(%{error: "unauthorized"})
    else
      checks = %{
        database: check_database_deep(),
        oban: check_oban_deep(),
        email: check_email(),
        memory: check_memory(),
        federation: check_federation()
      }

      overall =
        if Enum.all?(Map.values(checks), &healthy?/1), do: "ok", else: "degraded"

      status_code = if overall == "ok", do: 200, else: 503

      conn
      |> put_status(status_code)
      |> json(%{
        status: overall,
        checks: checks,
        uptime_seconds: System.monotonic_time(:second) - @app_start_time,
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
        version: Application.spec(:inkwell, :vsn) |> to_string()
      })
    end
  end

  # Basic checks

  defp check_database do
    start = System.monotonic_time(:microsecond)

    case Ecto.Adapters.SQL.query(Inkwell.Repo, "SELECT 1", []) do
      {:ok, _} ->
        latency_ms = (System.monotonic_time(:microsecond) - start) / 1000
        %{status: "ok", latency_ms: Float.round(latency_ms, 1)}

      {:error, _} ->
        %{status: "error"}
    end
  rescue
    _ -> %{status: "error"}
  end

  defp check_oban do
    # Oban 2.18+ doesn't register under a simple name — verify via oban_jobs table
    case Ecto.Adapters.SQL.query(Inkwell.Repo, "SELECT 1 FROM oban_jobs LIMIT 0", []) do
      {:ok, _} -> %{status: "ok"}
      {:error, _} -> %{status: "error"}
    end
  rescue
    _ -> %{status: "error"}
  end

  # Deep checks (authenticated)

  defp check_database_deep do
    start = System.monotonic_time(:microsecond)

    case Ecto.Adapters.SQL.query(Inkwell.Repo, "SELECT 1", []) do
      {:ok, _} ->
        latency_ms = (System.monotonic_time(:microsecond) - start) / 1000

        # Pool stats from DBConnection
        pool_stats =
          case Ecto.Adapters.SQL.query(
                 Inkwell.Repo,
                 "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()",
                 []
               ) do
            {:ok, %{rows: [[count]]}} -> %{active_connections: count}
            _ -> %{}
          end

        Map.merge(
          %{status: "ok", latency_ms: Float.round(latency_ms, 1)},
          pool_stats
        )

      {:error, reason} ->
        %{status: "error", error: inspect(reason)}
    end
  rescue
    e -> %{status: "error", error: Exception.message(e)}
  end

  defp check_oban_deep do
    case Ecto.Adapters.SQL.query(
           Inkwell.Repo,
           """
           SELECT state, count(*)
           FROM oban_jobs
           WHERE state IN ('available', 'executing', 'retryable', 'scheduled')
           GROUP BY state
           """,
           []
         ) do
      {:ok, %{rows: rows}} ->
        queue_stats =
          Enum.into(rows, %{}, fn [state, count] -> {state, count} end)

        %{
          status: "ok",
          available: Map.get(queue_stats, "available", 0),
          executing: Map.get(queue_stats, "executing", 0),
          retryable: Map.get(queue_stats, "retryable", 0),
          scheduled: Map.get(queue_stats, "scheduled", 0)
        }

      {:error, reason} ->
        %{status: "error", error: inspect(reason)}
    end
  rescue
    e -> %{status: "error", error: Exception.message(e)}
  end

  defp check_email do
    case Application.get_env(:inkwell, :resend_api_key) do
      key when is_binary(key) and key != "" -> %{status: "configured"}
      _ -> %{status: "not_configured"}
    end
  end

  defp check_memory do
    memory = :erlang.memory()

    %{
      status: "ok",
      total_mb: Float.round(memory[:total] / 1_048_576, 1),
      processes_mb: Float.round(memory[:processes] / 1_048_576, 1),
      binary_mb: Float.round(memory[:binary] / 1_048_576, 1),
      ets_mb: Float.round(memory[:ets] / 1_048_576, 1)
    }
  end

  # Federation checks — verifies all critical AP endpoints are reachable
  defp check_federation do
    instance_host = Application.get_env(:inkwell, :federation, []) |> Keyword.get(:instance_host, "inkwell-api.fly.dev")
    frontend_host = Application.get_env(:inkwell, :federation, []) |> Keyword.get(:frontend_host, "https://inkwell.social")

    # Pick a real user to test with (most recent user with a public key)
    test_user =
      case Ecto.Adapters.SQL.query(
             Inkwell.Repo,
             "SELECT username FROM users WHERE public_key IS NOT NULL AND blocked_at IS NULL ORDER BY inserted_at ASC LIMIT 1",
             []
           ) do
        {:ok, %{rows: [[username]]}} -> username
        _ -> nil
      end

    # Pick a real published public entry
    test_entry =
      case Ecto.Adapters.SQL.query(
             Inkwell.Repo,
             "SELECT id::text FROM entries WHERE status = 'published' AND privacy = 'public' ORDER BY published_at DESC LIMIT 1",
             []
           ) do
        {:ok, %{rows: [[id]]}} -> id
        _ -> nil
      end

    if is_nil(test_user) do
      # No users in DB (dev mode) — skip federation checks
      %{status: "ok", note: "no_users_to_test"}
    else
      check_federation_endpoints(test_user, test_entry, instance_host, frontend_host)
    end
  rescue
    e -> %{status: "error", error: Exception.message(e)}
  end

  defp check_federation_endpoints(test_user, test_entry, instance_host, frontend_host) do
    endpoints =
      [
        {"webfinger", "#{frontend_host}/.well-known/webfinger?resource=acct:#{test_user}@#{instance_host}"},
        {"actor", "#{frontend_host}/users/#{test_user}"},
        {"avatar", "#{frontend_host}/api/avatars/#{test_user}"},
        {"entry", if(test_entry, do: "#{frontend_host}/entries/#{test_entry}", else: nil)}
      ]
      |> Enum.reject(fn {_, url} -> is_nil(url) end)

    results =
      Enum.map(endpoints, fn {name, url} ->
        {name, check_federation_endpoint(url, name)}
      end)

    failures = Enum.filter(results, fn {_, result} -> result.status != "ok" end)

    overall = if failures == [], do: "ok", else: "degraded"

    endpoint_results = Enum.into(results, %{}, fn {name, result} -> {name, result} end)

    Map.merge(%{status: overall}, endpoint_results)
  rescue
    e -> %{status: "error", error: Exception.message(e)}
  end

  defp check_federation_endpoint(url, name) do
    headers =
      case name do
        "actor" -> [{"accept", "application/activity+json"}]
        "entry" -> [{"accept", "application/activity+json"}]
        _ -> []
      end

    start = System.monotonic_time(:microsecond)

    case :httpc.request(:get, {String.to_charlist(url), Enum.map(headers, fn {k, v} -> {String.to_charlist(k), String.to_charlist(v)} end)}, [timeout: 10_000, connect_timeout: 5_000], []) do
      {:ok, {{_, status_code, _}, _, _body}} when status_code in 200..299 ->
        latency_ms = (System.monotonic_time(:microsecond) - start) / 1000
        %{status: "ok", url: url, status_code: status_code, latency_ms: Float.round(latency_ms, 1)}

      {:ok, {{_, status_code, _}, _, _body}} ->
        latency_ms = (System.monotonic_time(:microsecond) - start) / 1000
        %{status: "error", url: url, status_code: status_code, latency_ms: Float.round(latency_ms, 1)}

      {:error, reason} ->
        %{status: "error", url: url, error: inspect(reason)}
    end
  rescue
    e -> %{status: "error", url: url, error: Exception.message(e)}
  end

  # A check is healthy if its status is "ok" or "configured" or "not_configured"
  # (not_configured is informational, not a failure)
  defp healthy?(%{status: "ok"}), do: true
  defp healthy?(%{status: "configured"}), do: true
  defp healthy?(%{status: "not_configured"}), do: true
  defp healthy?(_), do: false
end
