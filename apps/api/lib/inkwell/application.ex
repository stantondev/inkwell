defmodule Inkwell.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    redis_url = Application.get_env(:inkwell, :redis_url, "redis://localhost:6379")

    # Upstash Redis requires TLS — detect by URL scheme or hostname
    use_tls =
      String.starts_with?(redis_url, "rediss://") or
        String.contains?(redis_url, "upstash")

    # Normalize rediss:// → redis:// so Redix parses the URL correctly;
    # we enable TLS via the socket option instead.
    normalized_url = String.replace(redis_url, "rediss://", "redis://")

    redix_children =
      for i <- 0..4 do
        opts =
          [name: :"redix_#{i}"] ++
            if(use_tls, do: [tls: true], else: [])

        Supervisor.child_spec({Redix, {normalized_url, opts}}, id: {Redix, i})
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
