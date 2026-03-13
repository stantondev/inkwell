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
    length: 52_428_800

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug InkwellWeb.Plugs.CORS
  plug InkwellWeb.Plugs.HSTS
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

  # Cache raw body for federation inboxes — needed for HTTP Signature digest validation
  def cache_body_reader(%Plug.Conn{request_path: "/api/inbox"} = conn, opts) do
    {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
    conn = Plug.Conn.put_private(conn, :raw_body, body)
    {:ok, body, conn}
  end

  def cache_body_reader(%Plug.Conn{request_path: "/api/users/" <> rest} = conn, opts) when rest != "" do
    if String.ends_with?(rest, "/inbox") do
      {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
      conn = Plug.Conn.put_private(conn, :raw_body, body)
      {:ok, body, conn}
    else
      Plug.Conn.read_body(conn, opts)
    end
  end

  def cache_body_reader(conn, opts) do
    Plug.Conn.read_body(conn, opts)
  end
end
