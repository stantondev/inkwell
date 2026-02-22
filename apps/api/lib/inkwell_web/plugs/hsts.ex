defmodule InkwellWeb.Plugs.HSTS do
  @moduledoc """
  Adds Strict-Transport-Security header in production.
  Fly.io terminates TLS at the edge, so we skip the HTTPS redirect
  (which breaks health checks) and only set the HSTS header.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    if Application.get_env(:inkwell, :env) == :dev do
      conn
    else
      put_resp_header(conn, "strict-transport-security", "max-age=31536000; includeSubDomains")
    end
  end
end
