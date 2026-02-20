defmodule Inkwell.Redis do
  @moduledoc """
  Thin wrapper around Redix for common Redis operations.
  The Redix connection pool is started by Inkwell.Application.
  """

  @pool_name :redix_pool
  @pool_size 5

  def child_spec do
    children =
      for i <- 0..(@pool_size - 1) do
        Supervisor.child_spec(
          {Redix, Application.get_env(:inkwell, :redis_url, "redis://localhost:6379")},
          id: {Redix, i}
        )
      end

    children
  end

  @doc "Run a Redis command, returns the result or raises on error."
  def command!(command) do
    conn_name = :"redix_#{:rand.uniform(@pool_size) - 1}"
    case Redix.command(conn_name, command) do
      {:ok, result} -> result
      {:error, reason} -> raise "Redis error: #{inspect(reason)}"
    end
  end

  @doc "Run a pipeline of Redis commands."
  def pipeline!(commands) do
    conn_name = :"redix_#{:rand.uniform(@pool_size) - 1}"
    case Redix.pipeline(conn_name, commands) do
      {:ok, results} -> results
      {:error, reason} -> raise "Redis pipeline error: #{inspect(reason)}"
    end
  end
end
