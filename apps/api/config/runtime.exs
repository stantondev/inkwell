import Config

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  # Fly.io Postgres uses sslmode=disable internally
  config :inkwell, Inkwell.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "5"),
    ssl: false,
    socket_options: if(System.get_env("FLY_APP_NAME"), do: [:inet6], else: [])

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "inkwell-api.fly.dev"
  port = String.to_integer(System.get_env("PORT") || "4000")

  config :inkwell, InkwellWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      ip: {0, 0, 0, 0, 0, 0, 0, 0},
      port: port
    ],
    secret_key_base: secret_key_base,
    server: true

  # Redis
  redis_url = System.get_env("REDIS_URL") || "redis://localhost:6379"
  config :inkwell, :redis_url, redis_url

  config :inkwell, Inkwell.Redis,
    url: redis_url

  # CORS — allow the frontend domain
  frontend_url = System.get_env("FRONTEND_URL") || "https://inkwell-web.fly.dev"
  config :inkwell, :frontend_url, frontend_url
  config :inkwell, :cors_origins, [frontend_url]

  # Search (optional — disabled if MEILI_URL not set)
  config :inkwell, Inkwell.Search,
    url: System.get_env("MEILI_URL") || "http://localhost:7700",
    api_key: System.get_env("MEILI_API_KEY")
end
