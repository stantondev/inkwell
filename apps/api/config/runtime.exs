import Config

if config_env() == :prod do
  config :inkwell, :env, :prod

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
    socket_options: if(System.get_env("FLY_APP_NAME"), do: [:inet6], else: []),
    # Tolerate slow checkouts during Fly Postgres cold starts (auto-suspend wake-up).
    # Default queue_target=50ms drops requests after ~3s; we allow up to 10s.
    queue_target: 5_000,
    queue_interval: 30_000

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

  # CORS — allow the frontend domain
  frontend_url = System.get_env("FRONTEND_URL") || "https://inkwell.social"
  config :inkwell, :frontend_url, frontend_url
  config :inkwell, :cors_origins, [frontend_url]

  # API URL (used for absolute image URLs in newsletter emails)
  config :inkwell, :api_url, System.get_env("API_URL") || "https://api.inkwell.social"

  # Self-hosted mode (unlocks all Plus features, disables billing)
  config :inkwell, :self_hosted, System.get_env("INKWELL_SELF_HOSTED") == "true"

  # Email via Resend
  config :inkwell, :resend_api_key, System.get_env("RESEND_API_KEY")
  config :inkwell, :from_email, System.get_env("FROM_EMAIL") || "Inkwell <onboarding@resend.dev>"

  # Email via SMTP (takes priority over Resend when SMTP_HOST is set)
  smtp_host = System.get_env("SMTP_HOST")

  if smtp_host do
    config :inkwell, :smtp,
      host: smtp_host,
      port: String.to_integer(System.get_env("SMTP_PORT") || "587"),
      username: System.get_env("SMTP_USERNAME"),
      password: System.get_env("SMTP_PASSWORD"),
      ssl: System.get_env("SMTP_SSL") == "true",
      auth: System.get_env("SMTP_AUTH") != "false"
  end

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

  # Stripe billing (disabled — account closed, kept for reference)
  config :inkwell, :stripe,
    secret_key: System.get_env("STRIPE_SECRET_KEY"),
    webhook_secret: System.get_env("STRIPE_WEBHOOK_SECRET"),
    price_id: System.get_env("STRIPE_PRICE_ID"),
    ink_donor_price_1: System.get_env("STRIPE_INK_DONOR_PRICE_1"),
    ink_donor_price_2: System.get_env("STRIPE_INK_DONOR_PRICE_2"),
    ink_donor_price_3: System.get_env("STRIPE_INK_DONOR_PRICE_3"),
    success_url: "#{frontend_url}/settings/billing?success=true",
    cancel_url: "#{frontend_url}/settings/billing?canceled=true"

  # Square billing (bridge processor — replaces Stripe)
  config :inkwell, :square,
    access_token: System.get_env("SQUARE_ACCESS_TOKEN"),
    application_id: System.get_env("SQUARE_APPLICATION_ID"),
    location_id: System.get_env("SQUARE_LOCATION_ID"),
    webhook_signature_key: System.get_env("SQUARE_WEBHOOK_SIGNATURE_KEY"),
    plus_plan_variation_id: System.get_env("SQUARE_PLUS_PLAN_VARIATION_ID"),
    donor_plan_variation_1: System.get_env("SQUARE_DONOR_PLAN_VARIATION_1"),
    donor_plan_variation_2: System.get_env("SQUARE_DONOR_PLAN_VARIATION_2"),
    donor_plan_variation_3: System.get_env("SQUARE_DONOR_PLAN_VARIATION_3")

  # Feedback email recipient
  config :inkwell, :feedback_email, System.get_env("FEEDBACK_EMAIL") || "hello@inkwell.social"

  # Slack notifications (optional — disabled if not set)
  config :inkwell, :slack_webhook_url, System.get_env("SLACK_WEBHOOK_URL")

  # Monitoring (API key for /health/deep endpoint)
  config :inkwell, :monitor_api_key, System.get_env("MONITOR_API_KEY")

  # Healthchecks.io heartbeat ping URLs (one per Oban cron worker)
  # Workers ping these URLs after successful runs. If a ping is missed,
  # Healthchecks.io alerts via Slack. URLs look like: https://hc-ping.com/<uuid>
  healthchecks =
    %{
      cleanup_expired_tokens: System.get_env("HC_CLEANUP_TOKENS"),
      cleanup_orphaned_images: System.get_env("HC_CLEANUP_IMAGES"),
      cleanup_read_notifications: System.get_env("HC_CLEANUP_NOTIFICATIONS"),
      cleanup_abandoned_drafts: System.get_env("HC_CLEANUP_DRAFTS"),
      cleanup_remote_entries: System.get_env("HC_CLEANUP_REMOTE"),
      cleanup_expired_exports: System.get_env("HC_CLEANUP_EXPORTS"),
      cleanup_expired_imports: System.get_env("HC_CLEANUP_IMPORTS"),
      cleanup_unconfirmed_subscribers: System.get_env("HC_CLEANUP_SUBSCRIBERS"),
      newsletter_schedule: System.get_env("HC_NEWSLETTER_SCHEDULE")
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) or v == "" end)
    |> Map.new()

  config :inkwell, :healthchecks, healthchecks

  # Grafana Cloud metrics (optional — disabled if GRAFANA_METRICS_URL not set)
  # Pusher sends BEAM/DB/Oban/HTTP metrics every 60s via InfluxDB line protocol.
  # Get these values from Grafana Cloud → your stack → Prometheus details.
  grafana_url = System.get_env("GRAFANA_METRICS_URL")

  if is_binary(grafana_url) and grafana_url != "" do
    config :inkwell, :grafana, %{
      metrics_url: grafana_url,
      metrics_user: System.get_env("GRAFANA_METRICS_USER") || "",
      api_key: System.get_env("GRAFANA_API_KEY") || ""
    }
  end

  # Federation / ActivityPub
  config :inkwell, :federation,
    instance_host: System.get_env("INSTANCE_HOST") || "inkwell-api.fly.dev",
    frontend_host: System.get_env("FRONTEND_URL") || "https://inkwell.social"

  # Web Push (VAPID keys for browser push notifications)
  vapid_public = System.get_env("VAPID_PUBLIC_KEY")
  vapid_private = System.get_env("VAPID_PRIVATE_KEY")

  if is_binary(vapid_public) and vapid_public != "" do
    from_email = System.get_env("FROM_EMAIL") || "noreply@inkwell.social"
    # Extract just the email address if it's in "Name <email>" format
    vapid_subject =
      case Regex.run(~r/<(.+?)>/, from_email) do
        [_, email] -> "mailto:#{email}"
        _ -> "mailto:#{from_email}"
      end

    config :inkwell, :vapid,
      public_key: vapid_public,
      private_key: vapid_private,
      subject: vapid_subject

    config :web_push_encryption, :vapid_details,
      subject: vapid_subject,
      public_key: vapid_public,
      private_key: vapid_private
  end

  # Muse — AI content bot (optional, disabled by default)
  config :inkwell, :anthropic_api_key, System.get_env("ANTHROPIC_API_KEY")
  config :inkwell, :muse_enabled, System.get_env("MUSE_ENABLED") == "true"
  config :inkwell, :muse_username, System.get_env("MUSE_ACCOUNT_USERNAME") || "muse"

  # Fly.io API token (for custom domain certificate management)
  config :inkwell, :fly_api_token, System.get_env("FLY_API_TOKEN")

  # Post by Email (Postmark inbound webhook)
  config :inkwell, :postmark_inbound_token, System.get_env("POSTMARK_INBOUND_TOKEN")
  config :inkwell, :post_email_domain, System.get_env("POST_EMAIL_DOMAIN") || "post.inkwell.social"

  # DeepL API (for content translation — free tier: 500K chars/mo)
  config :inkwell, :deepl_api_key, System.get_env("DEEPL_API_KEY")
end
