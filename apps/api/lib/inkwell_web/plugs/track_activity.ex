defmodule InkwellWeb.Plugs.TrackActivity do
  @moduledoc """
  Lightweight plug that updates `last_active_at` on the current user.
  Throttled to at most once per hour to avoid a DB write on every request.
  """

  import Plug.Conn

  @throttle_seconds 3600

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{id: user_id, last_active_at: last_active} ->
        if should_update?(last_active) do
          Inkwell.Accounts.touch_last_active(user_id)
        end
        conn

      _ ->
        conn
    end
  end

  defp should_update?(nil), do: true
  defp should_update?(last_active) do
    DateTime.diff(DateTime.utc_now(), last_active, :second) >= @throttle_seconds
  end
end
