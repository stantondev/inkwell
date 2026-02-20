defmodule InkwellWeb.Plugs.CORS do
  @moduledoc """
  Runtime-configurable CORS plug.
  Reads allowed origins from application config at request time,
  so it works with runtime.exs in production releases.
  """

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    origins = Application.get_env(:inkwell, :cors_origins, ["http://localhost:3000"])

    CORSPlug.call(
      conn,
      CORSPlug.init(origin: origins, credentials: true)
    )
  end
end
