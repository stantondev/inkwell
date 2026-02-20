import Config

config :inkwell, InkwellWeb.Endpoint,
  url: [host: System.get_env("PHX_HOST") || "inkwell.social", port: 443, scheme: "https"],
  cache_static_manifest: "priv/static/cache_manifest.json",
  force_ssl: [rewrite_on: [:x_forwarded_proto]]

config :logger, level: :info
