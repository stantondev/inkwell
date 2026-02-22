defmodule InkwellWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :inkwell

  @session_options [
    store: :cookie,
    key: "_inkwell_key",
    signing_salt: "inkwell_salt",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]],
    longpoll: [connect_info: [session: @session_options]]

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library(),
    body_reader: {__MODULE__, :cache_body_reader, []},
    length: 5_000_000

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug InkwellWeb.Plugs.CORS
  plug InkwellWeb.Router

  @doc """
  Custom body reader that caches the raw body on the conn for routes
  that need it (Stripe webhooks).
  """
  def cache_body_reader(%Plug.Conn{request_path: "/api/billing/webhook"} = conn, opts) do
    {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
    conn = Plug.Conn.put_private(conn, :raw_body, body)
    {:ok, body, conn}
  end

  def cache_body_reader(conn, opts) do
    Plug.Conn.read_body(conn, opts)
  end
end
