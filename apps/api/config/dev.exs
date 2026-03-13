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

config :inkwell, :frontend_url, "http://localhost:3000"

config :inkwell, :cors_origins, ["http://localhost:3000"]

config :inkwell, :env, :dev

config :inkwell, Inkwell.Search,
  url: "http://localhost:7700",
  api_key: "inkwell_dev_key"

# Federation / ActivityPub (dev defaults)
config :inkwell, :federation,
  instance_host: "localhost:4000",
  frontend_host: "http://localhost:3000"

# Web Push (dev VAPID keys — NOT for production use)
# Generated via: mix run -e "IO.inspect(WebPushEncryption.generate_vapid_key())"
config :inkwell, :vapid,
  public_key: "BDe8lVBO1VEn9iChSFOolmGKSBFA7gEnb5HbSAHtz6MR-JCxqf6ZQfgOD0YpKLpHOkEiYZxzKRPMqi9UmY0WCaw",
  private_key: "4-k3fQIJ2S-B39_KE01hV9a6rXjYxoQel53BtEzMdQM",
  subject: "mailto:dev@inkwell.local"

config :web_push_encryption, :vapid_details,
  subject: "mailto:dev@inkwell.local",
  public_key: "BDe8lVBO1VEn9iChSFOolmGKSBFA7gEnb5HbSAHtz6MR-JCxqf6ZQfgOD0YpKLpHOkEiYZxzKRPMqi9UmY0WCaw",
  private_key: "4-k3fQIJ2S-B39_KE01hV9a6rXjYxoQel53BtEzMdQM"

config :logger, :console, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
