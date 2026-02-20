defmodule InkwellWeb.HealthController do
  use InkwellWeb, :controller

  def check(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
