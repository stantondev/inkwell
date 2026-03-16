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
  ],
  plugins: [
    {Oban.Plugins.Cron,
     crontab: [
       {"0 3 * * *", Inkwell.Workers.CleanupExpiredTokensWorker},
       {"0 4 * * *", Inkwell.Workers.CleanupOrphanedImagesWorker},
       {"30 4 * * *", Inkwell.Workers.CleanupReadNotificationsWorker},
       {"0 5 * * *", Inkwell.Workers.CleanupAbandonedDraftsWorker},
       {"15 5 * * *", Inkwell.Workers.CleanupRelayContentWorker},
       {"30 5 * * *", Inkwell.Workers.CleanupRemoteEntriesWorker},
       {"0 6 * * *", Inkwell.Workers.CleanupExpiredExportsWorker},
       {"30 6 * * *", Inkwell.Workers.CleanupExpiredImportsWorker},
       {"0 7 * * *", Inkwell.Workers.CleanupUnconfirmedSubscribersWorker},
       {"*/5 * * * *", Inkwell.Workers.NewsletterScheduleWorker},
       {"0 */4 * * *", Inkwell.Workers.VerifyRemoteEntriesWorker},
       {"0 9 * * *", Inkwell.Workers.MuseWorker, args: %{"type" => "daily_prompt"}},
       {"0 10 * * 0", Inkwell.Workers.MuseWorker, args: %{"type" => "weekly_roundup"}},
       {"0 11 1 * *", Inkwell.Workers.MuseWorker, args: %{"type" => "monthly_update"}},
       {"*/5 * * * *", Inkwell.Workers.CustomDomainCheckWorker},
       {"* * * * *", Inkwell.Workers.PollCloseWorker}
     ]}
  ]

import_config "#{config_env()}.exs"
