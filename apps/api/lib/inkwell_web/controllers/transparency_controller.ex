defmodule InkwellWeb.TransparencyController do
  use InkwellWeb, :controller

  # GET /api/transparency — public running costs, revenue and member counts
  # inkwell.social's own costs and members; a self-hosted server has neither.
  def show(conn, _params) do
    if Inkwell.SelfHosted.enabled?() do
      conn |> put_status(:not_found) |> json(%{error: "Not found"})
    else
      show_stats(conn)
    end
  end

  defp show_stats(conn) do
    conn
    |> put_resp_header("cache-control", "public, max-age=300")
    |> json(%{data: Inkwell.Transparency.stats()})
  end
end
