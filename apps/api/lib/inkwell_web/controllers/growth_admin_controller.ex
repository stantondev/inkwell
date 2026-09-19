defmodule InkwellWeb.GrowthAdminController do
  @moduledoc "Admin: where signups come from and which sources convert."
  use InkwellWeb, :controller

  # GET /api/admin/growth?days=30|90|365|all
  def index(conn, params) do
    days =
      case params["days"] do
        "all" -> nil
        d when is_binary(d) ->
          case Integer.parse(d) do
            {n, ""} when n > 0 and n <= 3650 -> n
            _ -> 90
          end
        _ -> 90
      end

    json(conn, Inkwell.Growth.report(days))
  end
end
