defmodule Inkwell.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Inkwell.Repo,
      {Phoenix.PubSub, name: Inkwell.PubSub},
      {Oban, Application.fetch_env!(:inkwell, Oban)},
      InkwellWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Inkwell.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    InkwellWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
