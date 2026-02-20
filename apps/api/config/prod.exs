import Config

config :inkwell, InkwellWeb.Endpoint,
  url: [host: System.get_env("PHX_HOST") || "inkwell.social", port: 443, scheme: "https"],
  cache_static_manifest: "priv/static/cache_manifest.json"
  # force_ssl is intentionally omitted — Fly.io terminates SSL at the edge
  # and its internal health checks use plain HTTP, so letting Phoenix force
  # SSL here causes health check 301 loops.

config :logger, level: :info
