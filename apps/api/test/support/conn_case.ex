defmodule InkwellWeb.ConnCase do
  @moduledoc """
  This module defines the test case for controller tests.

  Provides endpoint testing with authentication helpers.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      use Phoenix.ConnTest

      alias Inkwell.Repo
      import Ecto
      import Ecto.Changeset
      import Ecto.Query
      import InkwellWeb.ConnCase
      import Inkwell.Factory

      @endpoint InkwellWeb.Endpoint
    end
  end

  setup tags do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(Inkwell.Repo, shared: !tags[:async])
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end

  @doc """
  Authenticates a connection by creating a session token for the given user.
  Returns the conn with the Authorization header set.
  """
  def log_in_user(conn, user) do
    token = Inkwell.Auth.create_api_session_token(user.id)

    conn
    |> Plug.Conn.put_req_header("authorization", "Bearer #{token}")
    |> Plug.Conn.put_req_header("content-type", "application/json")
  end
end
