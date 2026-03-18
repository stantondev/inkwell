defmodule InkwellWeb.FederationDebugController do
  use InkwellWeb, :controller

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Federation.{FederationStats, RemoteEntries, RemoteEntry, RemoteActorSchema, Http}

  require Logger

  # GET /api/admin/federation/status
  def status(conn, _params) do
    endpoints = check_federation_endpoints()
    ets_stats = FederationStats.get_stats()
    oban_stats = get_oban_federation_stats()
    actor_stats = get_remote_actor_stats()
    entry_stats = get_remote_entry_stats()
    relay_stats = get_relay_stats()

    json(conn, %{
      endpoints: endpoints,
      inbound: ets_stats.inbound,
      outbound: Map.merge(ets_stats.outbound, %{pending_jobs: oban_stats.pending}),
      oban: oban_stats,
      remote_actors: actor_stats,
      remote_entries: entry_stats,
      relays: relay_stats,
      last_inbound_at: ets_stats.last_inbound_at,
      last_outbound_at: ets_stats.last_outbound_at,
      tracking_since: ets_stats.started_at
    })
  end

  # POST /api/admin/federation/refresh-engagement
  def refresh_engagement(conn, _params) do
    case Inkwell.Workers.RefreshEngagementWorker.new(%{})
         |> Oban.insert() do
      {:ok, _job} ->
        json(conn, %{ok: true, message: "Engagement refresh enqueued"})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to enqueue: #{inspect(reason)}"})
    end
  end

  # POST /api/admin/federation/test-webfinger
  def test_webfinger(conn, %{"handle" => handle}) do
    # Parse handle: user@domain or @user@domain
    handle = String.trim_leading(handle, "@")

    case String.split(handle, "@", parts: 2) do
      [username, domain] ->
        url = "https://#{domain}/.well-known/webfinger?resource=acct:#{username}@#{domain}"
        headers = [{~c"accept", ~c"application/jrd+json, application/json"}]

        start_time = System.monotonic_time(:millisecond)

        case Http.get(url, headers) do
          {:ok, {status, body}} when status in 200..299 ->
            latency = System.monotonic_time(:millisecond) - start_time

            case Jason.decode(body) do
              {:ok, jrd} ->
                json(conn, %{ok: true, status: status, latency_ms: latency, data: jrd})

              {:error, _} ->
                json(conn, %{ok: false, status: status, latency_ms: latency, error: "Invalid JSON response"})
            end

          {:ok, {status, _}} ->
            latency = System.monotonic_time(:millisecond) - start_time
            json(conn, %{ok: false, status: status, latency_ms: latency, error: "HTTP #{status}"})

          {:error, reason} ->
            json(conn, %{ok: false, error: inspect(reason)})
        end

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid handle format. Use user@domain"})
    end
  end

  def test_webfinger(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Missing 'handle' parameter"})
  end

  # POST /api/admin/federation/test-actor
  def test_actor(conn, %{"uri" => uri}) do
    headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    start_time = System.monotonic_time(:millisecond)

    case Http.get(uri, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        latency = System.monotonic_time(:millisecond) - start_time

        case Jason.decode(body) do
          {:ok, actor} ->
            summary = %{
              type: actor["type"],
              id: actor["id"],
              preferredUsername: actor["preferredUsername"],
              name: actor["name"],
              inbox: actor["inbox"],
              outbox: actor["outbox"],
              sharedInbox: get_in(actor, ["endpoints", "sharedInbox"]),
              has_public_key: is_map(actor["publicKey"]),
              followers: actor["followers"],
              following: actor["following"],
              icon_url: get_in(actor, ["icon", "url"]),
              summary_length: String.length(actor["summary"] || ""),
              published: actor["published"]
            }

            json(conn, %{ok: true, status: status, latency_ms: latency, actor: summary})

          {:error, _} ->
            json(conn, %{ok: false, status: status, latency_ms: latency, error: "Invalid JSON response"})
        end

      {:ok, {status, _}} ->
        latency = System.monotonic_time(:millisecond) - start_time
        json(conn, %{ok: false, status: status, latency_ms: latency, error: "HTTP #{status}"})

      {:error, reason} ->
        json(conn, %{ok: false, error: inspect(reason)})
    end
  end

  def test_actor(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Missing 'uri' parameter"})
  end

  # ── Private helpers ──────────────────────────────────────────────────

  defp check_federation_endpoints do
    config = Application.get_env(:inkwell, :federation, [])
    instance_host = Keyword.get(config, :instance_host, "inkwell.social")

    # Use localhost to check API endpoints directly (avoids Fly internal network issues
    # when trying to reach the frontend host via external HTTPS)
    port = Application.get_env(:inkwell, InkwellWeb.Endpoint)[:http][:port] || 4000
    api_base = "http://localhost:#{port}"

    # Find a test user and entry
    test_user =
      Inkwell.Accounts.User
      |> where([u], not is_nil(u.public_key))
      |> where([u], is_nil(u.blocked_at))
      |> order_by(asc: :inserted_at)
      |> limit(1)
      |> Repo.one()

    test_entry =
      Inkwell.Journals.Entry
      |> where([e], e.status == :published and e.privacy == :public)
      |> order_by(desc: :published_at)
      |> limit(1)
      |> Repo.one()

    endpoints = %{}

    endpoints =
      if test_user do
        webfinger_url = "#{api_base}/.well-known/webfinger?resource=acct:#{test_user.username}@#{instance_host}"
        actor_url = "#{api_base}/users/#{test_user.username}"
        avatar_url = "#{api_base}/api/avatars/#{test_user.username}"

        endpoints
        |> Map.put(:webfinger, check_endpoint(webfinger_url, [{~c"accept", ~c"application/jrd+json"}]))
        |> Map.put(:actor, check_endpoint(actor_url, [{~c"accept", ~c"application/activity+json"}]))
        |> Map.put(:avatar, check_endpoint(avatar_url, []))
      else
        endpoints
        |> Map.put(:webfinger, %{status: "skipped", reason: "no test user"})
        |> Map.put(:actor, %{status: "skipped", reason: "no test user"})
        |> Map.put(:avatar, %{status: "skipped", reason: "no test user"})
      end

    endpoints =
      if test_entry do
        entry_url = "#{api_base}/entries/#{test_entry.id}"
        Map.put(endpoints, :entry, check_endpoint(entry_url, [{~c"accept", ~c"application/activity+json"}]))
      else
        Map.put(endpoints, :entry, %{status: "skipped", reason: "no test entry"})
      end

    endpoints
  end

  defp check_endpoint(url, extra_headers) do
    headers = [{~c"user-agent", ~c"Inkwell/0.1 FederationDebug"} | extra_headers]

    start_time = System.monotonic_time(:millisecond)

    case :httpc.request(:get, {String.to_charlist(url), headers}, [timeout: 10_000, connect_timeout: 5_000], []) do
      {:ok, {{_, status, _}, _resp_headers, _body}} ->
        latency = System.monotonic_time(:millisecond) - start_time

        %{
          status: if(status in 200..299, do: "ok", else: "error"),
          http_status: status,
          latency_ms: latency,
          url: url
        }

      {:error, reason} ->
        latency = System.monotonic_time(:millisecond) - start_time

        error_msg = case reason do
          {:failed_connect, _} -> "Connection failed (expected in dev — endpoints are on inkwell.social)"
          :timeout -> "Timeout"
          _ -> inspect(reason)
        end

        %{
          status: "error",
          error: error_msg,
          latency_ms: latency,
          url: url
        }
    end
  end

  defp get_oban_federation_stats do
    query =
      from j in "oban_jobs",
        where: j.queue == "federation",
        where: j.state in ["available", "executing", "retryable", "scheduled"],
        group_by: j.state,
        select: {j.state, count(j.id)}

    states = Repo.all(query) |> Map.new()

    %{
      available: Map.get(states, "available", 0),
      executing: Map.get(states, "executing", 0),
      retryable: Map.get(states, "retryable", 0),
      scheduled: Map.get(states, "scheduled", 0),
      pending: Map.get(states, "available", 0) + Map.get(states, "scheduled", 0) + Map.get(states, "retryable", 0)
    }
  end

  defp get_remote_actor_stats do
    twenty_four_hours_ago = DateTime.add(DateTime.utc_now(), -24, :hour)

    total = Repo.aggregate(RemoteActorSchema, :count)

    stale =
      RemoteActorSchema
      |> where([a], a.updated_at < ^twenty_four_hours_ago)
      |> Repo.aggregate(:count)

    %{
      total: total,
      stale: stale
    }
  end

  defp get_remote_entry_stats do
    total = Repo.aggregate(RemoteEntry, :count)

    by_source_query =
      from e in RemoteEntry,
        group_by: e.source,
        select: {e.source, count(e.id)}

    by_source_raw = Repo.all(by_source_query) |> Map.new()

    avg_query =
      from e in RemoteEntry,
        select: %{
          avg_likes: avg(e.likes_count),
          avg_boosts: avg(e.boosts_count),
          avg_replies: avg(e.reply_count)
        }

    avg_engagement = Repo.one(avg_query) || %{}

    %{
      total: total,
      by_source: %{
        relay: Map.get(by_source_raw, "relay", 0),
        follow: Map.get(by_source_raw, "follow", 0) + Map.get(by_source_raw, nil, 0),
        inbox: Map.get(by_source_raw, "inbox", 0)
      },
      avg_engagement: %{
        likes: Float.round((avg_engagement[:avg_likes] || Decimal.new(0)) |> Decimal.to_float(), 1),
        boosts: Float.round((avg_engagement[:avg_boosts] || Decimal.new(0)) |> Decimal.to_float(), 1),
        replies: Float.round((avg_engagement[:avg_replies] || Decimal.new(0)) |> Decimal.to_float(), 1)
      }
    }
  end

  defp get_relay_stats do
    query =
      from r in Inkwell.Federation.RelaySubscription,
        group_by: r.status,
        select: {r.status, count(r.id)}

    by_status = Repo.all(query) |> Map.new(fn {k, v} -> {to_string(k), v} end)

    total_entries =
      from(r in Inkwell.Federation.RelaySubscription, select: sum(r.entry_count))
      |> Repo.one() || 0

    %{
      active: Map.get(by_status, "active", 0),
      paused: Map.get(by_status, "paused", 0),
      error: Map.get(by_status, "error", 0),
      pending: Map.get(by_status, "pending", 0),
      total_entries: total_entries
    }
  end
end
