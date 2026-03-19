defmodule InkwellWeb.Plugs.UserRateLimit do
  @moduledoc """
  Per-user rate limiter for content creation endpoints.
  Uses ETS with capped timestamp lists (same pattern as RateLimit plug).

  ## Usage in router pipeline

      pipeline :user_write_limited do
        plug InkwellWeb.Plugs.UserRateLimit, max_requests: 20, window_seconds: 60
      end

  Only applies when `conn.assigns.current_user` is set (after auth plugs).
  Falls through silently if no user is authenticated.
  """

  import Plug.Conn
  import Phoenix.Controller

  @table :user_rate_limit_buckets

  def init(opts) do
    %{
      max_requests: Keyword.get(opts, :max_requests, 30),
      window_seconds: Keyword.get(opts, :window_seconds, 60)
    }
  end

  def call(conn, %{max_requests: max, window_seconds: window}) do
    case conn.assigns[:current_user] do
      nil ->
        # No authenticated user — skip (IP-based rate limit handles unauthenticated)
        conn

      user ->
        ensure_table()
        key = {:user_write, user.id}
        now = System.system_time(:second)

        case check_rate(key, now, max, window) do
          {:allow, _count} ->
            conn

          {:deny, retry_after} ->
            conn
            |> put_status(:too_many_requests)
            |> put_resp_header("retry-after", Integer.to_string(retry_after))
            |> json(%{error: "Too many requests. Please slow down."})
            |> halt()
        end
    end
  end

  defp ensure_table do
    if :ets.whereis(@table) == :undefined do
      :ets.new(@table, [:set, :public, :named_table])
    end
  rescue
    ArgumentError -> :ok
  end

  defp check_rate(key, now, max, window) do
    window_start = now - window

    case :ets.lookup(@table, key) do
      [{^key, timestamps}] ->
        recent = Enum.filter(timestamps, &(&1 > window_start))
        count = length(recent) + 1

        if count > max do
          oldest = Enum.min(recent)
          retry_after = oldest + window - now
          {:deny, max(retry_after, 1)}
        else
          capped = Enum.take([now | recent], max)
          :ets.insert(@table, {key, capped})
          {:allow, count}
        end

      [] ->
        :ets.insert(@table, {key, [now]})
        {:allow, 1}
    end
  end
end
