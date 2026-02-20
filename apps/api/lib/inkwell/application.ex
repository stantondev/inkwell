defmodule Inkwell.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    redis_url = Application.get_env(:inkwell, :redis_url, "redis://localhost:6379")

    # Upstash Redis requires TLS. If the URL contains "upstash" but uses
    # the plain redis:// scheme, upgrade it to rediss:// so Redix enables TLS.
    redis_url =
      if String.contains?(redis_url, "upstash") and String.starts_with?(redis_url, "redis://") do
        String.replace_prefix(redis_url, "redis://", "rediss://")
      else
        redis_url
      end

    redix_children =
      for i <- 0..4 do
        Supervisor.child_spec({Redix, {redis_url, [name: :"redix_#{i}"]}}, id: {Redix, i})
      end

    children =
      [
        Inkwell.Repo,
        {Phoenix.PubSub, name: Inkwell.PubSub},
        {Oban, Application.fetch_env!(:inkwell, Oban)},
        InkwellWeb.Endpoint
      ] ++ redix_children

    opts = [strategy: :one_for_one, name: Inkwell.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    InkwellWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
