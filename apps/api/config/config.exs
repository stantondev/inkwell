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
    default: 5,
    federation: 5,
    search_indexing: 3,
    email: 5,
    gazette_ingestion: 2
  ],
  plugins: [
    {Oban.Plugins.Cron,
     crontab: [
       # Daily cleanups — kept on their original UTC slots (low-traffic hours,
       # already spread across the morning).
       {"0 3 * * *", Inkwell.Workers.CleanupExpiredTokensWorker},
       {"0 4 * * *", Inkwell.Workers.CleanupOrphanedImagesWorker},
       {"30 4 * * *", Inkwell.Workers.CleanupReadNotificationsWorker},
       {"0 5 * * *", Inkwell.Workers.CleanupAbandonedDraftsWorker},
       {"15 5 * * *", Inkwell.Workers.CleanupRelayContentWorker},
       {"30 5 * * *", Inkwell.Workers.CleanupRemoteEntriesWorker},
       {"0 6 * * *", Inkwell.Workers.CleanupExpiredExportsWorker},
       {"30 6 * * *", Inkwell.Workers.CleanupExpiredImportsWorker},
       {"0 7 * * *", Inkwell.Workers.CleanupUnconfirmedSubscribersWorker},
       # Newsletter scheduler — staggered to :07 so it doesn't collide with
       # the every-15min workers below.
       {"7-59/15 * * * *", Inkwell.Workers.NewsletterScheduleWorker},
       # Verify remote entries — was every 4h at :30, now every 8h. Deletion
       # detection latency goes from ~4h → ~8h; fine at this scale.
       {"30 1-23/8 * * *", Inkwell.Workers.VerifyRemoteEntriesWorker},
       # Refresh engagement — was every 2h at :00 (collided with Gazette).
       # Now every 6h at :17 so it lands in a quiet bucket.
       {"17 */6 * * *", Inkwell.Workers.RefreshEngagementWorker},
       # Muse content bot — gated behind MUSE_ENABLED, no-op when off.
       {"0 9 * * *", Inkwell.Workers.MuseWorker, args: %{"type" => "daily_prompt"}},
       {"0 10 * * 0", Inkwell.Workers.MuseWorker, args: %{"type" => "weekly_roundup"}},
       {"0 11 1 * *", Inkwell.Workers.MuseWorker, args: %{"type" => "monthly_update"}},
       # Custom-domain DNS/cert polling — was every 5m, now every 15m at :03.
       # Means a user adding a domain waits up to 15min for the first check
       # instead of 5min; acceptable since they're already waiting on DNS TTLs.
       {"3-59/15 * * * *", Inkwell.Workers.CustomDomainCheckWorker},
       # Poll close — was every 5m, now every 15m at :11. Polls expire on
       # their own; this just flips the DB status column.
       {"11-59/15 * * * *", Inkwell.Workers.PollCloseWorker},
       # Gazette ingestion — staggered to :23 to avoid the top-of-hour pile-up.
       # Effectively disabled in prod via GAZETTE_INGESTION_ENABLED=false.
       {"23 * * * *", Inkwell.Workers.GazetteIngestionScheduler}
     ]}
  ]

import_config "#{config_env()}.exs"
