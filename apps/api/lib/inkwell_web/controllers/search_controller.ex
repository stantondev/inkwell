defmodule InkwellWeb.SearchController do
  use InkwellWeb, :controller

  alias Inkwell.Federation.RemoteActor

  require Logger

  # GET /api/search?q=...&type=entries|users&page=1
  # Delegates to Meilisearch via HTTP. Falls back to a simple Postgres ILIKE
  # query if Meilisearch isn't available (great for early dev).
  def search(conn, %{"q" => q} = params) do
    type = Map.get(params, "type", "entries")
    page = parse_int(params["page"], 1)

    results =
      case search_meilisearch(q, type, page) do
        {:ok, hits} -> hits
        {:error, _} -> fallback_search(q, type, page)
      end

    json(conn, %{data: results, query: q, type: type, page: page})
  end

  def search(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "q (query) is required"})
  end

  # GET /api/search/fediverse?q=@user@domain or user@domain
  # Performs WebFinger lookup and returns the remote actor profile
  def fediverse(conn, %{"q" => q}) do
    handle = q |> String.trim() |> String.trim_leading("@")

    case parse_fediverse_handle(handle) do
      {:ok, username, domain} ->
        case webfinger_lookup(username, domain) do
          {:ok, actor_uri} ->
            case RemoteActor.fetch(actor_uri) do
              {:ok, actor} ->
                json(conn, %{
                  data: %{
                    username: actor.username,
                    domain: actor.domain,
                    display_name: actor.display_name,
                    avatar_url: actor.avatar_url,
                    ap_id: actor.ap_id,
                    profile_url: get_profile_url(actor),
                    id: actor.id
                  }
                })

              {:error, _reason} ->
                conn |> put_status(:not_found) |> json(%{error: "Could not fetch actor profile"})
            end

          {:error, _reason} ->
            conn |> put_status(:not_found) |> json(%{error: "User not found on #{domain}"})
        end

      :error ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Invalid handle. Use format: user@domain.com"})
    end
  end

  def fediverse(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "q (query) is required"})
  end

  # POST /api/search/fediverse/follow
  # Follow a remote actor by their remote_actor ID
  def fediverse_follow(conn, %{"remote_actor_id" => remote_actor_id}) do
    user = conn.assigns.current_user

    case RemoteActor.get(remote_actor_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Remote actor not found"})

      remote_actor ->
        # Check for existing relationship
        import Ecto.Query
        existing =
          Inkwell.Social.Relationship
          |> where([r], r.follower_id == ^user.id and r.remote_actor_id == ^remote_actor.id)
          |> Inkwell.Repo.one()

        if existing do
          json(conn, %{data: %{status: existing.status, already_following: true}})
        else
          # Create the follow relationship and send Follow activity
          case create_remote_follow(user, remote_actor) do
            {:ok, relationship} ->
              json(conn, %{data: %{status: relationship.status, already_following: false}})

            {:error, reason} ->
              Logger.error("Failed to follow remote actor: #{inspect(reason)}")
              conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to send follow request"})
          end
        end
    end
  end

  def fediverse_follow(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "remote_actor_id is required"})
  end

  # ── Fediverse helpers ──────────────────────────────────────────────────

  defp parse_fediverse_handle(handle) do
    case String.split(handle, "@") do
      [username, domain] when username != "" and domain != "" ->
        {:ok, username, domain}
      _ ->
        :error
    end
  end

  defp webfinger_lookup(username, domain) do
    resource = "acct:#{username}@#{domain}"
    url = "https://#{domain}/.well-known/webfinger?resource=#{URI.encode_www_form(resource)}"

    headers = [
      {~c"accept", ~c"application/jrd+json, application/json"},
      {~c"user-agent", ~c"Inkwell/0.1 (+https://inkwell-web.fly.dev)"}
    ]

    case :httpc.request(:get, {String.to_charlist(url), headers}, [{:timeout, 10_000}], []) do
      {:ok, {{_, 200, _}, _, body}} ->
        case Jason.decode(to_string(body)) do
          {:ok, %{"links" => links}} ->
            # Find the ActivityPub actor link
            actor_link =
              Enum.find(links, fn link ->
                link["rel"] == "self" &&
                  link["type"] in ["application/activity+json", "application/ld+json; profile=\"https://www.w3.org/ns/activitystreams\""]
              end)

            case actor_link do
              %{"href" => href} -> {:ok, href}
              _ -> {:error, :no_actor_link}
            end

          _ -> {:error, :invalid_webfinger}
        end

      {:ok, {{_, status, _}, _, _}} ->
        Logger.info("WebFinger lookup failed for #{username}@#{domain}: HTTP #{status}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.info("WebFinger lookup failed for #{username}@#{domain}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp get_profile_url(actor) do
    # Try to extract profile URL from raw_data, fall back to ap_id
    case actor.raw_data do
      %{"url" => url} when is_binary(url) -> url
      _ -> actor.ap_id
    end
  end

  defp create_remote_follow(user, remote_actor) do
    alias Inkwell.Social.Relationship
    alias Inkwell.Repo

    # Create relationship record (no following_id — remote_actor_id serves that role)
    attrs = %{
      follower_id: user.id,
      remote_actor_id: remote_actor.id,
      status: :pending
    }

    case %Relationship{} |> Relationship.changeset(attrs) |> Repo.insert() do
      {:ok, relationship} ->
        # Send Follow activity to remote actor's inbox
        instance_host = federation_config(:instance_host)
        actor_url = "https://#{instance_host}/users/#{user.username}"

        follow_activity = %{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "Follow",
          "id" => "#{actor_url}#follow-#{System.system_time(:second)}",
          "actor" => actor_url,
          "object" => remote_actor.ap_id
        }

        # Deliver asynchronously via Oban
        %{activity: follow_activity, inbox_url: remote_actor.inbox, user_id: user.id}
        |> Inkwell.Federation.Workers.DeliverActivityWorker.new()
        |> Oban.insert()

        {:ok, relationship}

      {:error, changeset} ->
        {:error, changeset}
    end
  end

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key)
  end

  # ── Meilisearch ──────────────────────────────────────────────────────────

  defp search_meilisearch(q, type, page) do
    index = if type == "users", do: "users", else: "entries"
    url = Application.get_env(:inkwell, :meilisearch_url, "http://localhost:7700")
    api_key = Application.get_env(:inkwell, :meilisearch_key, "")

    body = Jason.encode!(%{
      q: q,
      limit: 20,
      offset: (page - 1) * 20
    })

    headers = [
      {"Content-Type", "application/json"},
      {"Authorization", "Bearer #{api_key}"}
    ]

    case :httpc.request(:post,
           {~c"#{url}/indexes/#{index}/search", headers, ~c"application/json", body},
           [], []) do
      {:ok, {{_, 200, _}, _, resp_body}} ->
        case Jason.decode(to_string(resp_body)) do
          {:ok, %{"hits" => hits}} -> {:ok, hits}
          _ -> {:error, :parse_error}
        end

      _ ->
        {:error, :unavailable}
    end
  end

  # ── Postgres fallback ────────────────────────────────────────────────────

  defp fallback_search(q, "users", _page) do
    import Ecto.Query

    pattern = "%#{q}%"

    Inkwell.Accounts.User
    |> where([u], ilike(u.username, ^pattern) or ilike(u.display_name, ^pattern))
    |> limit(20)
    |> Inkwell.Repo.all()
    |> Enum.map(fn u ->
      %{id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url}
    end)
  end

  defp fallback_search(q, _type, _page) do
    import Ecto.Query

    pattern = "%#{q}%"

    Inkwell.Journals.Entry
    |> where([e], e.privacy == :public)
    |> where([e], ilike(e.title, ^pattern) or ilike(e.body_html, ^pattern))
    |> order_by(desc: :published_at)
    |> limit(20)
    |> Inkwell.Repo.all()
    |> Enum.map(fn e ->
      %{id: e.id, title: e.title, slug: e.slug, user_id: e.user_id, published_at: e.published_at}
    end)
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
