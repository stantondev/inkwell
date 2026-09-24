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

# Automated spam moderation: :dry_run (score + Slack "would block", change
# nothing) or :enforce. Overridden by AUTO_MODERATION_MODE in runtime.exs.
config :inkwell, :auto_moderation_mode, :dry_run

# Monthly running costs shown on the public /transparency page, in cents.
# {label, monthly_cents, note}. Update these when a bill changes.
config :inkwell, :transparency_costs, [
  {"Hosting (Fly.io)", 4700, "Website, API, database and search servers"},
  {"Email (Resend)", 2000, "Sign-in links, notifications and newsletters"}
]

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
    # Rescue jobs orphaned in the `executing` state — e.g. a worker process that
    # hung on a stalled remote, or died without releasing its slot. Without this,
    # a stuck job holds its queue slot indefinitely; that once wedged the
    # `default` queue and starved the daily cleanup crons until a manual machine
    # restart (site "down", Healthchecks.io alerts). rescue_after is set longer
    # than our longest legitimate job (newsletter batch sends, full search
    # reindex) so a slow-but-healthy job is never double-run.
    {Oban.Plugins.Lifeline, rescue_after: :timer.minutes(60)},
    # Keep the oban_jobs table from growing unbounded — trim completed/discarded
    # jobs older than 7 days.
    {Oban.Plugins.Pruner, max_age: 60 * 60 * 24 * 7},
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
       # Automated spam moderation: hourly scan of new/reported/active
       # accounts, a daily sweep, and a daily Slack digest (14:00 UTC).
       {"27 * * * *", Inkwell.Workers.AutoModerationWorker, args: %{"scope" => "recent"}},
       {"45 6 * * *", Inkwell.Workers.AutoModerationWorker, args: %{"scope" => "all"}},
       {"0 14 * * *", Inkwell.Workers.AutoModerationWorker, args: %{"scope" => "digest"}},
       # End free Plus trials whose 14 days are up — hourly at :41.
       {"41 * * * *", Inkwell.Workers.ExpirePlusTrialsWorker},
       # "Your first page" email to signups 3–10 days old who haven't written.
       # Does nothing unless FIRST_ENTRY_NUDGE_ENABLED=true.
       {"0 16 * * *", Inkwell.Workers.FirstEntryNudgeWorker},
       # Checkouts started vs. subscriptions completed — Mondays 15:00 UTC.
       {"0 15 * * 1", Inkwell.Workers.BillingFunnelWorker},
       {"* * * * *", Inkwell.Workers.PublishScheduledEntriesWorker},
       # Newsletter scheduler — every 5 minutes. Healthchecks.io is configured
       # to expect a ping every 5 minutes; changing this cadence requires
       # updating the Healthchecks check period to match.
       {"*/5 * * * *", Inkwell.Workers.NewsletterScheduleWorker},
       # Verify remote entries — was every 4h at :30, now every 8h. Deletion
       # detection latency goes from ~4h → ~8h; fine at this scale.
       {"30 1-23/8 * * *", Inkwell.Workers.VerifyRemoteEntriesWorker},
       # Refresh engagement — was every 2h at :00 (collided with Gazette).
       # Now every 6h at :17 so it lands in a quiet bucket.
       {"17 */6 * * *", Inkwell.Workers.RefreshEngagementWorker},
       # Custom-domain DNS/cert polling — was every 5m, now every 15m at :03.
       # Means a user adding a domain waits up to 15min for the first check
       # instead of 5min; acceptable since they're already waiting on DNS TTLs.
       {"3-59/15 * * * *", Inkwell.Workers.CustomDomainCheckWorker},
       # Poll close — was every 5m, now every 15m at :11. Polls expire on
       # their own; this just flips the DB status column.
       {"11-59/15 * * * *", Inkwell.Workers.PollCloseWorker},
       # Hashtag polling for Explore's fediverse posts — every 6h at :23.
       # (It used to feed the Gazette too; the Gazette now reads trending links.)
       {"23 */6 * * *", Inkwell.Workers.GazetteIngestionScheduler},
       # Gazette: read the fediverse's trending links hourly, and publish the
       # morning (11:05 UTC) and evening (22:05 UTC) editions.
       {"41 * * * *", Inkwell.Workers.GazetteWorker, args: %{"task" => "ingest"}},
       {"5 11,22 * * *", Inkwell.Workers.GazetteWorker, args: %{"task" => "edition"}}
     ]}
  ]

import_config "#{config_env()}.exs"
