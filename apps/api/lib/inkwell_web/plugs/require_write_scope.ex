defmodule InkwellWeb.Plugs.RequireWriteScope do
  @moduledoc """
  Blocks write operations (POST/PATCH/PUT/DELETE) for API keys without the "write" scope.
  Session-authenticated requests always pass through.
  Also enforces Plus requirement for write-scoped API keys.
  """

  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  @write_methods ["POST", "PATCH", "PUT", "DELETE"]

  def call(conn, _opts) do
    if conn.assigns[:auth_method] == :api_key and conn.method in @write_methods do
      api_key = conn.assigns[:api_key]
      user = conn.assigns[:current_user]

      cond do
        "write" not in api_key.scopes ->
          conn
          |> put_status(:forbidden)
          |> json(%{error: "This API key does not have write access. Create a key with the 'write' scope."})
          |> halt()

        user.subscription_tier != "plus" ->
          conn
          |> put_status(:forbidden)
          |> json(%{error: "Write API access requires a Plus subscription. Upgrade at /settings/billing"})
          |> halt()

        true ->
          conn
      end
    else
      # GET requests or session auth — always pass through
      conn
    end
  end
end
