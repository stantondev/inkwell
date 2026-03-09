defmodule InkwellWeb.Plugs.SelfHostedTier do
  @moduledoc """
  When INKWELL_SELF_HOSTED=true, overrides current_user.subscription_tier
  to "plus" so all downstream Plus checks pass without per-controller changes.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    if Inkwell.SelfHosted.enabled?() do
      case conn.assigns[:current_user] do
        nil ->
          conn

        user ->
          upgraded = Map.put(user, :subscription_tier, "plus")
          assign(conn, :current_user, upgraded)
      end
    else
      conn
    end
  end
end
