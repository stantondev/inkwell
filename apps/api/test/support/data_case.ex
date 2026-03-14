defmodule Inkwell.DataCase do
  @moduledoc """
  This module defines the setup for tests requiring
  access to the application's data layer.

  Uses Ecto.Adapters.SQL.Sandbox for test isolation.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      alias Inkwell.Repo
      import Ecto
      import Ecto.Changeset
      import Ecto.Query
      import Inkwell.DataCase
      import Inkwell.Factory
    end
  end

  setup tags do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(Inkwell.Repo, shared: !tags[:async])
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
    :ok
  end

  @doc """
  A helper that transforms changeset errors into a map of messages.
  """
  def errors_on(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
      Regex.replace(~r"%{(\w+)}", message, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
