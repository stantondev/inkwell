import Config

config :inkwell, Inkwell.Repo,
  username: "inkwell",
  password: "inkwell",
  hostname: "localhost",
  database: "inkwell_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :inkwell, InkwellWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "test_secret_key_base_replace_in_production_with_real_secret_that_is_at_least_64_bytes_long",
  server: false

config :logger, level: :warning

config :inkwell, Oban, testing: :inline

# Run federation side work inline instead of in a Task (see Inkwell.Federation.Background).
config :inkwell, :federation_background, false

# Don't read fediverse posts' counts from real servers (Inkwell.Federation.Engagement).
config :inkwell, :refresh_fediverse_counts, false

# Federation host config so activity building (Mention tags, absolute URLs)
# behaves like production in tests.
config :inkwell, :federation,
  instance_host: "inkwell.test",
  frontend_host: "https://inkwell.test"

config :inkwell, :frontend_url, "https://inkwell.test"
