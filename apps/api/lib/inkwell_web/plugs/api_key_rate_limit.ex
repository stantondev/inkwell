defmodule InkwellWeb.Plugs.ApiKeyRateLimit do
  @moduledoc """
  Per-API-key rate limiter. Uses ETS sliding window keyed on the API key ID.
  Only activates for API-key-authenticated requests; session auth passes through.

  Rate limits by tier:
  - Free:  100 read / 15 min (no write access)
  - Plus:  300 read / 15 min, 60 write / 15 min
  """

  import Plug.Conn
  import Phoenix.Controller

  @table :api_key_rate_limit
  @window_seconds 900  # 15 minutes

  # Limits: {read_max, write_max}
  @free_limits {100, 0}
  @plus_limits {300, 60}

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:auth_method] do
      :api_key -> rate_limit(conn)
      _ -> conn
    end
  end

  defp rate_limit(conn) do
    ensure_table()

    api_key = conn.assigns[:api_key]
    user = conn.assigns[:current_user]
    is_write = conn.method in ["POST", "PATCH", "PUT", "DELETE"]

    {read_max, write_max} =
      if user.subscription_tier == "plus", do: @plus_limits, else: @free_limits

    {key_suffix, max} =
      if is_write do
        {"write", write_max}
      else
        {"read", read_max}
      end

    bucket_key = "#{api_key.id}:#{key_suffix}"
    now = System.system_time(:second)

    case check_rate(bucket_key, now, max) do
      {:allow, count} ->
        conn
        |> put_resp_header("x-ratelimit-limit", Integer.to_string(max))
        |> put_resp_header("x-ratelimit-remaining", Integer.to_string(max(max - count, 0)))

      {:deny, retry_after} ->
        conn
        |> put_status(:too_many_requests)
        |> put_resp_header("retry-after", Integer.to_string(retry_after))
        |> json(%{error: "Rate limit exceeded", retry_after: retry_after})
        |> halt()
    end
  end

  defp ensure_table do
    if :ets.whereis(@table) == :undefined do
      :ets.new(@table, [:set, :public, :named_table])
    end
  rescue
    ArgumentError -> :ok
  end

  defp check_rate(key, now, max) do
    window_start = now - @window_seconds

    case :ets.lookup(@table, key) do
      [{^key, timestamps}] ->
        recent = Enum.filter(timestamps, &(&1 > window_start))
        count = length(recent) + 1

        if count > max do
          oldest = Enum.min(recent)
          retry_after = oldest + @window_seconds - now
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
end
