defmodule Inkwell.ObjectStore.Memory do
  @moduledoc "In-memory object store for tests (an ETS table)."
  @behaviour Inkwell.ObjectStore

  @table :inkwell_object_store_memory

  def reset do
    ensure_table()
    :ets.delete_all_objects(@table)
    :ok
  end

  def keys do
    ensure_table()
    :ets.select(@table, [{{:"$1", :_, :_}, [], [:"$1"]}])
  end

  @impl true
  def put(key, body, content_type) do
    ensure_table()
    :ets.insert(@table, {key, body, content_type})
    :ok
  end

  @impl true
  def get(key) do
    ensure_table()

    case :ets.lookup(@table, key) do
      [{^key, body, _}] -> {:ok, body}
      [] -> {:error, :not_found}
    end
  end

  @impl true
  def delete(key) do
    ensure_table()
    :ets.delete(@table, key)
    :ok
  end

  # The table belongs to a process that never exits, so it outlives the test
  # that happened to create it.
  defp ensure_table do
    if :ets.whereis(@table) == :undefined do
      parent = self()

      spawn(fn ->
        try do
          :ets.new(@table, [:named_table, :public, :set])
        rescue
          ArgumentError -> :ok
        end

        send(parent, {:object_store_memory, :ready})
        Process.sleep(:infinity)
      end)

      receive do
        {:object_store_memory, :ready} -> :ok
      after
        1_000 -> :ok
      end
    end

    :ok
  end
end
