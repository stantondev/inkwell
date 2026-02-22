import Config

config :inkwell, Inkwell.Repo,
  username: "inkwell",
  password: "inkwell",
  hostname: "localhost",
  database: "inkwell_dev",
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :inkwell, InkwellWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: 4000],
  check_origin: false,
  debug_errors: true,
  secret_key_base: "dev_secret_key_base_replace_in_production_with_real_secret_that_is_at_least_64_bytes",
  watchers: []

config :inkwell, :redis_url, "redis://localhost:6379"

config :inkwell, :frontend_url, "http://192.168.64.2:3000"

config :inkwell, :cors_origins, ["http://localhost:3000", "http://192.168.64.2:3000"]

config :inkwell, :env, :dev

config :inkwell, Inkwell.Search,
  url: "http://localhost:7700",
  api_key: "inkwell_dev_key"

# Federation / ActivityPub (dev defaults)
config :inkwell, :federation,
  instance_host: "localhost:4000",
  frontend_host: "http://localhost:3000"

config :logger, :console, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
