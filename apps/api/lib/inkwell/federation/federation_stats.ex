defmodule Inkwell.Federation.FederationStats do
  @moduledoc """
  Lightweight ETS-based tracking of federation activity.
  Tracks inbound activity counts by type, outbound delivery success/failure,
  and recent delivery failures. Data is ephemeral — lost on restart.
  """

  @table :inkwell_federation_stats

  def setup do
    :ets.new(@table, [:set, :public, :named_table])
    :ets.insert(@table, {:recent_failures, []})
    :ets.insert(@table, {:last_inbound_at, nil})
    :ets.insert(@table, {:last_outbound_at, nil})
    :ets.insert(@table, {:started_at, DateTime.utc_now() |> DateTime.to_iso8601()})
    :ok
  end

  @doc "Track an inbound federation activity by type."
  def track_inbound(activity_type, _result \\ :ok) do
    key = {:inbound, activity_type}
    try do
      :ets.update_counter(@table, key, {2, 1})
    rescue
      ArgumentError ->
        :ets.insert(@table, {key, 1})
    end
    :ets.insert(@table, {:last_inbound_at, DateTime.utc_now() |> DateTime.to_iso8601()})
  rescue
    _ -> :ok
  end

  @doc "Track an outbound delivery attempt."
  def track_outbound(inbox_url, result) do
    case result do
      :ok ->
        increment(:outbound_success)

      {:error, reason} ->
        increment(:outbound_failure)
        add_recent_failure(inbox_url, reason)
    end
    :ets.insert(@table, {:last_outbound_at, DateTime.utc_now() |> DateTime.to_iso8601()})
  rescue
    _ -> :ok
  end

  @doc "Get all federation stats as a map."
  def get_stats do
    %{
      inbound: get_inbound_stats(),
      outbound: get_outbound_stats(),
      started_at: get_value(:started_at),
      last_inbound_at: get_value(:last_inbound_at),
      last_outbound_at: get_value(:last_outbound_at)
    }
  rescue
    _ -> %{inbound: %{}, outbound: %{success: 0, failure: 0, recent_failures: []}, started_at: nil, last_inbound_at: nil, last_outbound_at: nil}
  end

  def reset do
    :ets.delete_all_objects(@table)
    setup()
  end

  # Private helpers

  defp increment(key) do
    try do
      :ets.update_counter(@table, key, {2, 1})
    rescue
      ArgumentError ->
        :ets.insert(@table, {key, 1})
    end
  end

  defp add_recent_failure(inbox_url, reason) do
    failure = %{
      inbox: inbox_url,
      error: inspect(reason),
      at: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    case :ets.lookup(@table, :recent_failures) do
      [{:recent_failures, failures}] ->
        updated = [failure | failures] |> Enum.take(50)
        :ets.insert(@table, {:recent_failures, updated})

      [] ->
        :ets.insert(@table, {:recent_failures, [failure]})
    end
  end

  defp get_inbound_stats do
    :ets.tab2list(@table)
    |> Enum.filter(fn
      {{:inbound, _type}, _count} -> true
      _ -> false
    end)
    |> Map.new(fn {{:inbound, type}, count} -> {type, count} end)
  end

  defp get_outbound_stats do
    %{
      success: get_counter(:outbound_success),
      failure: get_counter(:outbound_failure),
      recent_failures: get_value(:recent_failures) || []
    }
  end

  defp get_counter(key) do
    case :ets.lookup(@table, key) do
      [{^key, count}] -> count
      [] -> 0
    end
  end

  defp get_value(key) do
    case :ets.lookup(@table, key) do
      [{^key, value}] -> value
      [] -> nil
    end
  end
end
