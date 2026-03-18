defmodule Inkwell.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Set up HTTP request metrics tracking (ETS + telemetry handler)
    Inkwell.Metrics.HttpTracker.setup()

    # Set up federation activity tracking (ETS)
    Inkwell.Federation.FederationStats.setup()

    # ETS table for per-user entry creation rate limiting
    :ets.new(:entry_creation_buckets, [:set, :public, :named_table])

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
