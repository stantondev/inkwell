defmodule Inkwell.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Set up HTTP request metrics tracking (ETS + telemetry handler)
    Inkwell.Metrics.HttpTracker.setup()

    # Set up federation activity tracking (ETS)
    Inkwell.Federation.FederationStats.setup()

    # ETS tables for rate limiting and caching.
    #
    # These must be created HERE, by the long-lived application process. An ETS
    # table is owned by the process that creates it and is destroyed when that
    # process exits. Every table below was previously created lazily inside an
    # `ensure_table/0` helper that runs in a Phoenix request process (or an Oban
    # worker), so the table died with whichever request happened to create it.
    #
    # The practical effect was that rate limiting fired non-deterministically —
    # it only held for as long as one Bandit connection process stayed alive,
    # and reset to empty otherwise — and the federation caches never survived to
    # be read. Verified in production: a live magic-link request left no
    # :rate_limit_buckets table behind at all.
    #
    # The lazy ensure_* helpers are left in place; they simply no-op now that
    # the tables already exist, which also keeps unit tests working.
    for table <- [
          # Rate limiters
          :rate_limit_buckets,
          :billing_rate_limit,
          :user_rate_limit_buckets,
          :api_key_rate_limit,
          :entry_creation_buckets,
          # Federation caches
          :remote_actor_negative_cache,
          :federation_domain_rate,
          :inkwell_nodeinfo_cache
        ] do
      if :ets.whereis(table) == :undefined do
        :ets.new(table, [:set, :public, :named_table])
      end
    end

    children = [
      Inkwell.Repo,
      {Phoenix.PubSub, name: Inkwell.PubSub},
      {Oban, Application.fetch_env!(:inkwell, Oban)},
      Inkwell.Auth.LoginHandoff,
      InkwellWeb.Endpoint,
      # Metrics pusher — pushes to Grafana Cloud every 60s (returns :ignore if not configured)
      Inkwell.Metrics.Pusher
    ]

    opts = [strategy: :one_for_one, name: Inkwell.Supervisor]
    result = Supervisor.start_link(children, opts)

    # Start IPv6-capable :httpc profile for Meilisearch (Fly.io internal networking)
    Inkwell.Search.start_httpc_profile()

    # Set up Meilisearch indexes after Repo + Oban are started
    Task.start(fn -> Inkwell.Search.setup_indexes!() end)

    result
  end

  @impl true
  def config_change(changed, _new, removed) do
    InkwellWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
