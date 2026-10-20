defmodule InkwellWeb.UsageController do
  @moduledoc "Feature usage: count a use (public) and show admins the numbers."

  use InkwellWeb, :controller

  alias Inkwell.Usage

  # POST /api/usage  {feature, action?, detail?}  (optional auth)
  # Always 204, counted or not, so nothing about the counting leaks.
  def create(conn, params) do
    feature = params["feature"]

    if is_binary(feature) do
      Usage.record(
        feature,
        conn.assigns[:current_user],
        InkwellWeb.Plugs.RateLimit.client_ip(conn),
        conn |> get_req_header("user-agent") |> List.first(),
        action: params["action"],
        detail: params["detail"]
      )
    end

    send_resp(conn, 204, "")
  end

  # GET /api/admin/usage
  def report(conn, _params) do
    json(conn, %{data: Usage.report()})
  end
end
