defmodule InkwellWeb.Plugs.EffectiveTier do
  @moduledoc """
  Sets `current_user.subscription_tier` to what the account actually gets,
  so every downstream Plus check is right without per-controller changes:

  - Self-hosted (INKWELL_SELF_HOSTED=true): everyone is "plus".
  - Plus whose paid or granted time has run out: "free" — and a manual
    grant's row is downgraded here, once (`Billing.end_plus_if_time_ran_out/1`).
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      nil ->
        conn

      user ->
        if Inkwell.SelfHosted.enabled?() do
          assign(conn, :current_user, Map.put(user, :subscription_tier, "plus"))
        else
          assign(conn, :current_user, Inkwell.Billing.end_plus_if_time_ran_out(user))
        end
    end
  end
end
