defmodule InkwellWeb.TransparencyController do
  use InkwellWeb, :controller

  # GET /api/transparency — public running costs, revenue and member counts
  def show(conn, _params) do
    conn
    |> put_resp_header("cache-control", "public, max-age=300")
    |> json(%{data: Inkwell.Transparency.stats()})
  end
end
