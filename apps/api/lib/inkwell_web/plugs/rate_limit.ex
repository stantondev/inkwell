defmodule InkwellWeb.Plugs.RateLimit do
  @moduledoc """
  Simple ETS-based rate limiter. Limits requests per IP within a time window.

  ## Usage in router

      plug InkwellWeb.Plugs.RateLimit, max_requests: 5, window_seconds: 300

  This would allow 5 requests per IP per 5-minute window.
  """

  import Plug.Conn
  import Phoenix.Controller

  @table :rate_limit_buckets

  def init(opts) do
    %{
      max_requests: Keyword.get(opts, :max_requests, 5),
      window_seconds: Keyword.get(opts, :window_seconds, 300)
    }
  end

  def call(conn, %{max_requests: max, window_seconds: window}) do
    ensure_table()
    key = client_ip(conn)
    now = System.system_time(:second)

    case check_rate(key, now, max, window) do
      {:allow, count} ->
        conn
        |> put_resp_header("x-ratelimit-limit", Integer.to_string(max))
        |> put_resp_header("x-ratelimit-remaining", Integer.to_string(max(max - count, 0)))

      {:deny, retry_after} ->
        conn
        |> put_status(:too_many_requests)
        |> put_resp_header("retry-after", Integer.to_string(retry_after))
        |> json(%{error: "Too many requests. Please try again later."})
        |> halt()
    end
  end

  defp ensure_table do
    if :ets.whereis(@table) == :undefined do
      :ets.new(@table, [:set, :public, :named_table])
    end
  rescue
    # Another process may have created the table between our check and creation
    ArgumentError -> :ok
  end

  defp check_rate(key, now, max, window) do
    window_start = now - window

    case :ets.lookup(@table, key) do
      [{^key, timestamps}] ->
        # Filter to only timestamps within the current window
        recent = Enum.filter(timestamps, &(&1 > window_start))
        count = length(recent) + 1

        if count > max do
          # Find when the oldest request in the window expires
          oldest = Enum.min(recent)
          retry_after = oldest + window - now
          {:deny, max(retry_after, 1)}
        else
          :ets.insert(@table, {key, [now | recent]})
          {:allow, count}
        end

      [] ->
        :ets.insert(@table, {key, [now]})
        {:allow, 1}
    end
  end

  defp client_ip(conn) do
    # Check x-forwarded-for first (Fly.io proxy sets this)
    case get_req_header(conn, "x-forwarded-for") do
      [forwarded | _] ->
        forwarded
        |> String.split(",")
        |> List.first()
        |> String.trim()

      [] ->
        conn.remote_ip |> :inet.ntoa() |> to_string()
    end
  end
end
