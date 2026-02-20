import Config

config :inkwell,
  ecto_repos: [Inkwell.Repo],
  generators: [timestamp_type: :utc_datetime_usec]

config :inkwell, InkwellWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: InkwellWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Inkwell.PubSub,
  live_view: [signing_salt: "inkwell_signing_salt"]

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

config :inkwell, Oban,
  repo: Inkwell.Repo,
  queues: [
    default: 10,
    federation: 20,
    search_indexing: 5,
    email: 10
  ]

import_config "#{config_env()}.exs"
