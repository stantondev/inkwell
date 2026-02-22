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
  frontend_url = System.get_env("FRONTEND_URL") || "https://inkwell.social"
  config :inkwell, :frontend_url, frontend_url
  config :inkwell, :cors_origins, [frontend_url]

  # Email via Resend
  config :inkwell, :resend_api_key, System.get_env("RESEND_API_KEY")
  config :inkwell, :from_email, System.get_env("FROM_EMAIL") || "Inkwell <onboarding@resend.dev>"

  # Search (optional — disabled if MEILI_URL not set)
  config :inkwell, Inkwell.Search,
    url: System.get_env("MEILI_URL") || "http://localhost:7700",
    api_key: System.get_env("MEILI_API_KEY")

  # Admin usernames (comma-separated list)
  config :inkwell, :admin_usernames,
    System.get_env("ADMIN_USERNAMES", "")
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))

  # Stripe billing (optional — disabled if STRIPE_SECRET_KEY not set)
  config :inkwell, :stripe,
    secret_key: System.get_env("STRIPE_SECRET_KEY"),
    webhook_secret: System.get_env("STRIPE_WEBHOOK_SECRET"),
    price_id: System.get_env("STRIPE_PRICE_ID"),
    success_url: "#{frontend_url}/settings/billing?success=true",
    cancel_url: "#{frontend_url}/settings/billing?canceled=true"

  # Feedback email recipient
  config :inkwell, :feedback_email, System.get_env("FEEDBACK_EMAIL") || "stanton@inkwell.social"

  # Federation / ActivityPub
  config :inkwell, :federation,
    instance_host: System.get_env("INSTANCE_HOST") || "inkwell-api.fly.dev",
    frontend_host: System.get_env("FRONTEND_URL") || "https://inkwell.social"
end
