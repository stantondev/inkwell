defmodule InkwellWeb.FederationController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals}
  alias Inkwell.Journals.Comment
  alias Inkwell.Federation.{ActivityBuilder, HttpSignature, Relays, RemoteActor, RemoteEntries}
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FetchOutboxWorker, RelayContentWorker}
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  # ── Actor endpoint ──────────────────────────────────────────────────────

  # GET /users/:username — content-negotiated AP Actor
  def actor(conn, %{"username" => username}) do
    accept = get_req_header(conn, "accept") |> List.first() || ""

    is_ap_request =
      String.contains?(accept, "application/activity+json") ||
        String.contains?(accept, "application/ld+json")

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      user ->
        if is_ap_request do
          person = ActivityBuilder.build_person(user)

          conn
          |> put_resp_content_type("application/activity+json")
          |> json(person)
        else
          # Redirect browsers to the frontend profile page
          frontend_host = federation_config(:frontend_host)
          redirect(conn, external: "#{frontend_host}/#{username}")
        end
    end
  end

  # ── Entry object endpoint ───────────────────────────────────────────────

  # GET /entries/:id — AP Entry (Article) object
  def entry_object(conn, %{"id" => id}) do
    case Journals.get_entry(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      entry ->
        if entry.status == :published and entry.privacy == :public do
          user = Accounts.get_user!(entry.user_id)
          article =
            ActivityBuilder.build_article(entry, user)
            |> Map.put("@context", ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"])

          conn
          |> put_resp_content_type("application/activity+json")
          |> json(article)
        else
          conn |> put_status(:not_found) |> json(%{error: "Not found"})
        end
    end
  end

  # GET /entries/by-slug/:username/:slug — AP Entry (Article) object via slug URL
  def entry_object_by_slug(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         entry when not is_nil(entry) <- Journals.get_entry_by_slug(user.id, slug),
         true <- entry.status == :published and entry.privacy == :public do
      article =
        ActivityBuilder.build_article(entry, user)
        |> Map.put("@context", ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"])

      conn
      |> put_resp_content_type("application/activity+json")
      |> json(article)
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # ── WebFinger ───────────────────────────────────────────────────────────

  # GET /.well-known/webfinger?resource=acct:username@domain
  def webfinger(conn, %{"resource" => resource}) do
    instance_host = federation_config(:instance_host)

    # Accept requests for both the canonical domain and the API domain
    # so WebFinger works whether queried directly or via the frontend proxy.
    accepted_hosts = [instance_host, "inkwell.social", "api.inkwell.social", "inkwell-api.fly.dev"]

    with "acct:" <> rest <- resource,
         [username, host] <- String.split(rest, "@"),
         true <- host in accepted_hosts,
         user when not is_nil(user) <- Accounts.get_user_by_username(username) do

      conn
      |> put_resp_content_type("application/jrd+json")
      |> json(%{
        subject: "acct:#{username}@#{instance_host}",
        links: [
          %{
            rel: "self",
            type: "application/activity+json",
            href: "https://#{instance_host}/users/#{username}"
          },
          %{
            rel: "http://webfinger.net/rel/profile-page",
            type: "text/html",
            href: "#{federation_config(:frontend_host)}/#{username}"
          }
        ]
      })
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  def webfinger(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "resource parameter required"})
  end

  # ── NodeInfo ────────────────────────────────────────────────────────────

  # GET /.well-known/nodeinfo
  # Advertise both 2.0 and 2.1 so older stats crawlers (fedidb,
  # the-federation.info) that only speak 2.0 can still discover us.
  def nodeinfo(conn, _params) do
    instance_host = federation_config(:instance_host)

    conn
    |> put_resp_content_type("application/json")
    |> json(%{
      links: [
        %{
          rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
          href: "https://#{instance_host}/nodeinfo/2.0"
        },
        %{
          rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
          href: "https://#{instance_host}/nodeinfo/2.1"
        }
      ]
    })
  end

  # GET /nodeinfo/2.0
  # 2.0 differs from 2.1: software{} cannot include homepage/repository,
  # and services{} is required (we bridge to nothing, so both are []).
  def nodeinfo_schema_20(conn, _params) do
    stats = nodeinfo_stats()

    conn
    |> put_resp_content_type("application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.0\"")
    |> json(%{
      version: "2.0",
      software: %{
        name: "inkwell",
        version: "0.1.0"
      },
      protocols: ["activitypub"],
      services: %{inbound: [], outbound: []},
      usage: stats,
      openRegistrations: true,
      metadata: %{}
    })
  end

  # GET /nodeinfo/2.1
  def nodeinfo_schema(conn, _params) do
    stats = nodeinfo_stats()

    conn
    |> put_resp_content_type("application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.1\"")
    |> json(%{
      version: "2.1",
      software: %{
        name: "inkwell",
        version: "0.1.0",
        repository: "https://github.com/stantondev/inkwell",
        homepage: "https://inkwell.social"
      },
      protocols: ["activitypub"],
      services: %{inbound: [], outbound: []},
      usage: stats,
      openRegistrations: true,
      metadata: %{}
    })
  end

  # Cache NodeInfo aggregates for 10 minutes. The 5 sequential aggregate
  # queries here cost ~150-300ms; fediverse stats crawlers (fedidb,
  # the-federation.info) poll this on schedules of minutes-to-hours, so
  # serving stale-by-up-to-10-minutes counts is fine and the spec allows it.
  @nodeinfo_cache_table :inkwell_nodeinfo_cache
  @nodeinfo_cache_ttl_seconds 600

  defp nodeinfo_stats do
    ensure_nodeinfo_cache_table()
    now = System.system_time(:second)

    case :ets.lookup(@nodeinfo_cache_table, :stats) do
      [{:stats, stats, expires_at}] when expires_at > now ->
        stats

      _ ->
        stats = compute_nodeinfo_stats()
        :ets.insert(@nodeinfo_cache_table, {:stats, stats, now + @nodeinfo_cache_ttl_seconds})
        stats
    end
  rescue
    ArgumentError -> compute_nodeinfo_stats()
  end

  defp compute_nodeinfo_stats do
    user_count = Repo.aggregate(Inkwell.Accounts.User, :count)
    post_count = Repo.aggregate(Inkwell.Journals.Entry, :count)
    comment_count = Repo.aggregate(Inkwell.Journals.Comment, :count)

    now = DateTime.utc_now()
    six_months_ago = DateTime.add(now, -180, :day)
    one_month_ago = DateTime.add(now, -30, :day)

    active_halfyear =
      from(e in Inkwell.Journals.Entry,
        where: e.status == :published and e.inserted_at >= ^six_months_ago,
        select: count(e.user_id, :distinct)
      )
      |> Repo.one()

    active_month =
      from(e in Inkwell.Journals.Entry,
        where: e.status == :published and e.inserted_at >= ^one_month_ago,
        select: count(e.user_id, :distinct)
      )
      |> Repo.one()

    %{
      users: %{
        total: user_count,
        activeHalfyear: active_halfyear,
        activeMonth: active_month
      },
      localPosts: post_count,
      localComments: comment_count
    }
  end

  defp ensure_nodeinfo_cache_table do
    if :ets.whereis(@nodeinfo_cache_table) == :undefined do
      :ets.new(@nodeinfo_cache_table, [:set, :public, :named_table])
    end
  rescue
    ArgumentError -> :ok
  end

  # GET /.well-known/host-meta
  # XRD pointer to WebFinger. Some older Mastodon clients and discovery
  # tools probe this before falling back to /.well-known/webfinger directly.
  def host_meta(conn, _params) do
    instance_host = federation_config(:instance_host)

    body = """
    <?xml version="1.0" encoding="UTF-8"?>
    <XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
      <Link rel="lrdd" type="application/xrd+xml" template="https://#{instance_host}/.well-known/webfinger?resource={uri}"/>
    </XRD>
    """

    conn
    |> put_resp_content_type("application/xrd+xml")
    |> send_resp(200, body)
  end

  # ── Outbox ──────────────────────────────────────────────────────────────

  # GET /users/:username/outbox
  def outbox(conn, %{"username" => username} = params) do
    instance_host = federation_config(:instance_host)

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        page = params["page"]

        if page do
          page_num = String.to_integer(page)
          entries = Journals.list_public_entries(user.id, page: page_num, per_page: 20)

          items = Enum.map(entries, fn entry ->
            ActivityBuilder.build_create_note(entry, user)
          end)

          conn
          |> put_resp_content_type("application/activity+json")
          |> json(%{
            "@context" => "https://www.w3.org/ns/activitystreams",
            "type" => "OrderedCollectionPage",
            "id" => "https://#{instance_host}/users/#{username}/outbox?page=#{page_num}",
            "partOf" => "https://#{instance_host}/users/#{username}/outbox",
            "orderedItems" => items
          })
        else
          total = Journals.count_public_entries(user.id)

          conn
          |> put_resp_content_type("application/activity+json")
          |> json(%{
            "@context" => "https://www.w3.org/ns/activitystreams",
            "type" => "OrderedCollection",
            "id" => "https://#{instance_host}/users/#{username}/outbox",
            "totalItems" => total,
            "first" => "https://#{instance_host}/users/#{username}/outbox?page=1"
          })
        end
    end
  end

  # ── Featured collection (pinned posts) ─────────────────────────────────

  # GET /users/:username/featured
  def featured(conn, %{"username" => username}) do
    instance_host = federation_config(:instance_host)

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        pinned_ids = user.pinned_entry_ids || []

        items =
          if pinned_ids == [] do
            []
          else
            Inkwell.Journals.Entry
            |> where([e], e.id in ^pinned_ids)
            |> where([e], e.status == :published and e.privacy == :public)
            |> Repo.all()
            |> Enum.map(fn entry -> ActivityBuilder.build_article(entry, user) end)
          end

        conn
        |> put_resp_content_type("application/activity+json")
        |> json(%{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollection",
          "id" => "https://#{instance_host}/users/#{username}/featured",
          "totalItems" => length(items),
          "orderedItems" => items
        })
    end
  end

  # ── Guestbook post (AP Note for fediverse guestbook signing) ───────────

  # GET /users/:username/guestbook-post
  def guestbook_post(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        note = ActivityBuilder.build_guestbook_post(user)

        conn
        |> put_resp_content_type("application/activity+json")
        |> json(note)
    end
  end

  # ── Followers / Following collections ───────────────────────────────────

  # GET /users/:username/followers
  def followers(conn, %{"username" => username}) do
    instance_host = federation_config(:instance_host)

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        count =
          Inkwell.Social.Relationship
          |> where([r], r.following_id == ^user.id and r.status == :accepted)
          |> Repo.aggregate(:count)

        conn
        |> put_resp_content_type("application/activity+json")
        |> json(%{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollection",
          "id" => "https://#{instance_host}/users/#{username}/followers",
          "totalItems" => count
        })
    end
  end

  # GET /users/:username/following
  def following(conn, %{"username" => username}) do
    instance_host = federation_config(:instance_host)

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        count =
          Inkwell.Social.Relationship
          |> where([r], r.follower_id == ^user.id and r.status == :accepted)
          |> Repo.aggregate(:count)

        conn
        |> put_resp_content_type("application/activity+json")
        |> json(%{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollection",
          "id" => "https://#{instance_host}/users/#{username}/following",
          "totalItems" => count
        })
    end
  end

  # ── Inbox (ActivityPub processing) ──────────────────────────────────────
  #
  # Inbox endpoints verify HTTP signature + validate origin synchronously
  # (the security boundary), then enqueue the activity for async processing
  # and return 202 immediately. All DB writes, remote actor fetches, and
  # downstream fan-out happen in `Inkwell.Federation.Workers.ProcessInboxActivityWorker`,
  # decoupled from the request lifecycle.
  #
  # This matches how Mastodon, Pleroma, Akkoma, GoToSocial all handle inbox
  # traffic. It prevents Delete fan-outs and signature retry storms from
  # tying up the Phoenix request pool.

  # POST /users/:username/inbox
  def inbox(conn, %{"username" => username} = params) do
    case verify_inbox_signature(conn) do
      :ok ->
        case validate_actor_origin(conn, params) do
          :ok ->
            enqueue_inbox_activity(params, username)
            conn |> put_status(:accepted) |> json(%{ok: true})

          {:error, :domain_mismatch} ->
            Logger.warning("Inbox: REJECTED — actor domain mismatch for #{params["actor"]}")
            conn |> put_status(:unauthorized) |> json(%{error: "Actor domain mismatch"})
        end

      {:error, reason} ->
        Logger.warning("Inbox: rejected #{params["type"] || "unknown"} from #{params["actor"] || "unknown"} to /users/#{username}/inbox — #{inspect(reason)}")
        Inkwell.Federation.FederationStats.track_inbound("rejected_signature")
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
    end
  end

  # POST /inbox  (shared inbox)
  def shared_inbox(conn, params) do
    case verify_inbox_signature(conn) do
      :ok ->
        case validate_actor_origin(conn, params) do
          :ok ->
            enqueue_inbox_activity(params, nil)
            conn |> put_status(:accepted) |> json(%{ok: true})

          {:error, :domain_mismatch} ->
            Logger.warning("Shared inbox: REJECTED — actor domain mismatch for #{params["actor"]}")
            conn |> put_status(:unauthorized) |> json(%{error: "Actor domain mismatch"})
        end

      {:error, reason} ->
        Logger.warning("Shared inbox: rejected #{params["type"] || "unknown"} from #{params["actor"] || "unknown"} — #{inspect(reason)}")
        Inkwell.Federation.FederationStats.track_inbound("rejected_signature")
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
    end
  end

  defp enqueue_inbox_activity(activity, target_username) do
    %{"activity" => activity, "target_username" => target_username}
    |> Inkwell.Federation.Workers.ProcessInboxActivityWorker.new()
    |> Oban.insert()
  end

  # ── Activity processing (called from ProcessInboxActivityWorker) ────────
  #
  # `process_activity_async/2` is the public entry point used by the worker.
  # It dispatches to the per-type `handle_*` private functions below. None of
  # these functions take a `conn` — they just process the activity and return
  # `:ok` or `{:error, reason}`. Errors are logged and the Oban job retries
  # with backoff.

  @doc false
  def process_activity_async(activity, target_user) do
    activity_type = activity["type"]
    actor_uri = activity["actor"]
    Logger.info("Inbox received #{activity_type} activity from #{actor_uri}")
    Inkwell.Federation.FederationStats.track_inbound(activity_type)

    actor_domain =
      case URI.parse(actor_uri || "") do
        %URI{host: host} when is_binary(host) -> String.downcase(host)
        _ -> nil
      end

    cond do
      actor_domain && Inkwell.Moderation.FediverseBlocks.is_domain_defederated?(actor_domain) ->
        Logger.info("Dropping #{activity_type} from defederated domain #{actor_domain}")
        :ok

      true ->
        dispatch_activity(activity_type, activity, target_user)
    end
  end

  defp dispatch_activity("Follow", activity, target_user), do: handle_follow(activity, target_user)
  defp dispatch_activity("Undo", activity, target_user), do: handle_undo(activity, target_user)
  defp dispatch_activity("Create", activity, target_user), do: handle_create(activity, target_user)
  defp dispatch_activity("Accept", activity, target_user), do: handle_accept(activity, target_user)
  defp dispatch_activity("Like", activity, target_user), do: handle_like(activity, target_user)
  defp dispatch_activity("Update", activity, target_user), do: handle_update(activity, target_user)
  defp dispatch_activity("Delete", activity, target_user), do: handle_delete(activity, target_user)
  defp dispatch_activity("Announce", activity, target_user), do: handle_announce(activity, target_user)

  defp dispatch_activity(other, _activity, _target_user) do
    Logger.info("Ignoring unsupported activity type: #{other}")
    :ok
  end

  # ── Signature verification ──────────────────────────────────────────────

  # Verifies the HTTP Signature on inbound ActivityPub requests.
  # Returns :ok on success, {:error, reason} on failure (hard reject).
  #
  # Handles two keyId formats:
  #   - Fragment URI (Mastodon): "https://example.com/users/alice#main-key"
  #   - Path URI (GoToSocial):  "https://example.com/users/alice/main-key"
  #
  # On signature failure, retries once with a fresh actor fetch (key rotation).
  defp verify_inbox_signature(conn) do
    case HttpSignature.parse_signature(conn) do
      {:error, :no_signature} ->
        Logger.warning("Inbox: REJECTED — no HTTP Signature header from #{actor_from_conn(conn)}")
        {:error, :no_signature}

      {:error, reason} ->
        Logger.warning("Inbox: REJECTED — malformed Signature header — #{inspect(reason)}")
        {:error, reason}

      {:ok, sig_parts} ->
        key_id = sig_parts["keyId"] || ""
        actor_uri = resolve_actor_uri_from_key_id(key_id)

        case RemoteActor.fetch(actor_uri) do
          {:ok, actor} ->
            case HttpSignature.verify_signature(conn, sig_parts, actor.public_key_pem) do
              :ok ->
                Logger.debug("Inbox: signature verified for #{actor_uri}")
                :ok

              {:error, _reason} ->
                # Key rotation retry: re-fetch actor bypassing cache and try once more.
                # The remote actor may have rotated their keypair since we last cached it.
                Logger.info("Inbox: signature failed for #{actor_uri}, retrying with fresh key fetch")

                case RemoteActor.fetch(actor_uri, force: true) do
                  {:ok, fresh_actor} ->
                    case HttpSignature.verify_signature(conn, sig_parts, fresh_actor.public_key_pem) do
                      :ok ->
                        Logger.info("Inbox: signature verified for #{actor_uri} after key refresh")
                        :ok

                      {:error, reason} ->
                        Logger.warning("Inbox: signature FAILED for #{actor_uri} after retry — #{inspect(reason)}")
                        {:error, reason}
                    end

                  {:error, reason} ->
                    Logger.warning("Inbox: REJECTED — could not re-fetch actor #{actor_uri} — #{inspect(reason)}")
                    {:error, reason}
                end
            end

          {:error, reason} ->
            Logger.warning("Inbox: REJECTED — could not fetch actor #{actor_uri} — #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  # Validates that the signing key's domain matches the activity actor's domain.
  # Prevents spoofing: attacker at evil.com cannot sign activities claiming to be from mastodon.social.
  defp validate_actor_origin(conn, activity) do
    actor_uri = activity["actor"]

    if is_nil(actor_uri) or not is_binary(actor_uri) do
      {:error, :domain_mismatch}
    else
      # Extract the signing key's domain from the parsed signature
      case Inkwell.Federation.HttpSignature.parse_signature(conn) do
        {:ok, sig_parts} ->
          key_id = sig_parts["keyId"] || ""
          key_domain = URI.parse(key_id) |> Map.get(:host) |> to_string() |> String.downcase()
          actor_domain = URI.parse(actor_uri) |> Map.get(:host) |> to_string() |> String.downcase()

          if key_domain == actor_domain do
            :ok
          else
            Logger.warning("Actor origin mismatch: key from #{key_domain}, actor claims #{actor_domain}")
            {:error, :domain_mismatch}
          end

        {:error, _} ->
          # If we can't parse the signature, the earlier verify_inbox_signature would have rejected
          :ok
      end
    end
  end

  # Resolves the actor URI from a keyId.
  # Fragment-style (Mastodon): "https://example.com/users/alice#main-key" → strip fragment
  # Path-style (GoToSocial): "https://example.com/users/alice/main-key" → fetch key doc, follow owner
  defp resolve_actor_uri_from_key_id(key_id) do
    uri = URI.parse(key_id)

    if uri.fragment do
      # Fragment URI — strip the fragment to get the actor URI
      %{uri | fragment: nil} |> URI.to_string()
    else
      # Could be a path-style keyId (GoToSocial) or a direct actor URI.
      # Try fetching the keyId URL to see if it returns a Key document with an owner.
      case fetch_key_owner(key_id) do
        {:ok, owner_uri} -> owner_uri
        :not_a_key -> key_id
      end
    end
  end

  # Fetches a keyId URL and checks if it returns a Key/CryptographicKey document
  # with an "owner" or "controller" property pointing to the actual actor.
  defp fetch_key_owner(key_id) do
    headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    case Inkwell.Federation.Http.get(key_id, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, %{"type" => type} = data} when type in ["Key", "CryptographicKey"] ->
            owner = data["owner"] || data["controller"]
            if is_binary(owner), do: {:ok, owner}, else: :not_a_key

          _ ->
            :not_a_key
        end

      _ ->
        :not_a_key
    end
  end

  defp actor_from_conn(conn) do
    # Best-effort: peek at the already-parsed body params for the actor field.
    case conn.body_params do
      %{"actor" => actor} when is_binary(actor) -> actor
      _ -> "(unknown)"
    end
  end

  # ── Follow handling ─────────────────────────────────────────────────────

  defp handle_follow(activity, target_user) do
    actor_uri = activity["actor"]

    with true <- target_user != nil,
         {:ok, remote_actor} <- RemoteActor.fetch(actor_uri) do

      case create_remote_follow(remote_actor, target_user) do
        {:ok, :created, _rel} ->
          # Auto-accept: send Accept activity back
          accept = ActivityBuilder.build_accept(activity, target_user)
          inbox = remote_actor.shared_inbox || remote_actor.inbox

          %{activity: accept, inbox_url: inbox, user_id: target_user.id}
          |> DeliverActivityWorker.new()
          |> Oban.insert()

          # Notify the Inkwell user about the new fediverse follower
          create_fediverse_follow_notification(target_user, remote_actor)

          Logger.info("Accepted follow from #{actor_uri} → #{target_user.username}")

        {:ok, :existing, _rel} ->
          # Duplicate Follow activity — re-send Accept but skip notification
          accept = ActivityBuilder.build_accept(activity, target_user)
          inbox = remote_actor.shared_inbox || remote_actor.inbox

          %{activity: accept, inbox_url: inbox, user_id: target_user.id}
          |> DeliverActivityWorker.new()
          |> Oban.insert()

          Logger.info("Re-accepted existing follow from #{actor_uri} → #{target_user.username}")

        {:error, reason} ->
          Logger.warning("Failed to create follow relationship: #{inspect(reason)}")
      end

      :ok
    else
      _ ->
        Logger.warning("Follow handling failed for #{actor_uri}")
        :ok
    end
  end

  defp create_remote_follow(remote_actor, target_user) do
    existing =
      Inkwell.Social.Relationship
      |> where([r], r.remote_actor_id == ^remote_actor.id and r.following_id == ^target_user.id)
      |> Repo.one()

    case existing do
      nil ->
        case %Inkwell.Social.Relationship{}
             |> Inkwell.Social.Relationship.changeset(%{
               remote_actor_id: remote_actor.id,
               following_id: target_user.id,
               status: :accepted,
               is_mutual: false
             })
             |> Repo.insert() do
          {:ok, rel} -> {:ok, :created, rel}
          {:error, reason} -> {:error, reason}
        end

      rel ->
        {:ok, :existing, rel}
    end
  end

  defp create_fediverse_follow_notification(target_user, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    %Inkwell.Accounts.Notification{}
    |> Inkwell.Accounts.Notification.changeset(%{
      user_id: target_user.id,
      type: :fediverse_follow,
      target_type: "user",
      target_id: target_user.id,
      data: %{
        remote_actor: %{
          id: remote_actor.id,
          display_name: remote_actor.display_name || remote_actor.username,
          username: remote_actor.username,
          domain: remote_actor.domain,
          avatar_url: remote_actor.avatar_url,
          profile_url: profile_url,
          ap_id: remote_actor.ap_id
        }
      }
    })
    |> Repo.insert()
  end

  # ── Undo handling ───────────────────────────────────────────────────────

  defp handle_undo(activity, target_user) do
    case activity["object"] do
      %{"type" => "Follow"} ->
        actor_uri = activity["actor"]

        case RemoteActor.get_by_ap_id(actor_uri) do
          nil ->
            :ok

          remote_actor ->
            query =
              Inkwell.Social.Relationship
              |> where([r], r.remote_actor_id == ^remote_actor.id)

            query =
              if target_user,
                do: where(query, [r], r.following_id == ^target_user.id),
                else: query

            Repo.delete_all(query)
            Logger.info("Processed unfollow from #{actor_uri}")
        end

      %{"type" => "Like", "object" => object_uri} = like_object when is_binary(object_uri) ->
        actor_uri = activity["actor"]
        like_id = like_object["id"]

        case RemoteActor.get_by_ap_id(actor_uri) do
          nil ->
            # Fallback: try matching by AP Like ID
            if is_binary(like_id), do: Inkwell.Inks.remove_remote_ink_by_ap_id(like_id)

          remote_actor ->
            case find_entry_by_ap_url(object_uri) do
              nil ->
                if is_binary(like_id), do: Inkwell.Inks.remove_remote_ink_by_ap_id(like_id)

              entry ->
                Inkwell.Inks.remove_remote_ink(remote_actor.id, entry.id)
                Logger.info("Processed Undo Like from #{actor_uri} on entry #{entry.id}")
            end
        end

      %{"type" => "Announce", "object" => object_uri} = announce_object when is_binary(object_uri) ->
        actor_uri = activity["actor"]
        announce_id = announce_object["id"]

        case RemoteActor.get_by_ap_id(actor_uri) do
          nil ->
            if is_binary(announce_id) do
              Inkwell.Reprints.remove_remote_reprint_by_ap_id(announce_id)
            end

          remote_actor ->
            case find_entry_by_ap_url(object_uri) do
              nil ->
                if is_binary(announce_id) do
                  Inkwell.Reprints.remove_remote_reprint_by_ap_id(announce_id)
                end

              entry ->
                Inkwell.Reprints.remove_remote_reprint(remote_actor.id, entry.id)
                Logger.info("Processed Undo Announce from #{actor_uri} on entry #{entry.id}")
            end
        end

      _ ->
        :ok
    end

    :ok
  end

  # ── Accept handling (outbound follow accepted) ──────────────────────────

  defp handle_accept(activity, _target_user) do
    case activity["object"] do
      %{"type" => "Follow", "actor" => local_actor_url} when is_binary(local_actor_url) ->
        # This is a remote server accepting our follow request
        remote_actor_uri = activity["actor"]

        # Extract our local username from the actor URL
        case Regex.run(~r|/users/([^/]+)$|, local_actor_url) do
          [_, "relay"] ->
            # Relay Accept — update subscription status to active
            Relays.handle_relay_accept(remote_actor_uri)

          [_, username] ->
            case {Accounts.get_user_by_username(username), RemoteActor.get_by_ap_id(remote_actor_uri)} do
              {%{id: user_id}, %{id: remote_actor_id}} ->
                # Update the outbound relationship from pending to accepted + mutual
                Inkwell.Social.Relationship
                |> where([r], r.follower_id == ^user_id and r.remote_actor_id == ^remote_actor_id)
                |> Repo.update_all(set: [status: :accepted, is_mutual: true, updated_at: DateTime.utc_now()])

                # Also mark the inbound relationship (them → us) as mutual
                Inkwell.Social.Relationship
                |> where([r], r.remote_actor_id == ^remote_actor_id and r.following_id == ^user_id and r.status == :accepted)
                |> Repo.update_all(set: [is_mutual: true, updated_at: DateTime.utc_now()])

                # Backfill the remote actor's recent posts
                %{remote_actor_id: remote_actor_id}
                |> FetchOutboxWorker.new()
                |> Oban.insert()

                Logger.info("Follow accepted by #{remote_actor_uri} for #{username}")

              _ ->
                Logger.info("Accept: could not find user or remote actor")
            end

          _ ->
            Logger.info("Accept: could not extract username from #{local_actor_url}")
        end

      _ ->
        :ok
    end

    :ok
  end

  # ── Create handling (inbound Notes) ─────────────────────────────────────

  defp handle_create(activity, target_user) do
    object = activity["object"]
    object_type = if is_map(object), do: object["type"], else: "non-map: #{inspect(object)}"
    in_reply_to = if is_map(object), do: object["inReplyTo"], else: nil
    Logger.info("handle_create: object type=#{object_type}, inReplyTo=#{inspect(in_reply_to)}, actor=#{activity["actor"]}")

    case object do
      %{"type" => type, "inReplyTo" => reply_to}
          when type in ["Note", "Article", "Page"] and is_binary(reply_to) ->
        # Reply to a local entry (Note, Article, or Page)
        handle_incoming_reply(object, activity["actor"])

      %{"type" => type} = obj when type in ["Note", "Article", "Page"] ->
        # Standalone public post — store as remote entry for Explore
        handle_incoming_note(obj, activity["actor"])
        # If delivered to a personal inbox, check for @mentions of the inbox owner
        maybe_create_mention_notification(obj, activity["actor"], target_user)

      _ ->
        Logger.info("handle_create: unhandled object format — #{inspect(object_type)}")
        :ok
    end

    :ok
  end

  # ── Update handling (inbound edits) ────────────────────────────────────

  defp handle_update(activity, _target_user) do
    case activity["object"] do
      %{"type" => type, "inReplyTo" => _} = object when type in ["Note", "Article", "Page"] ->
        # This is an edited comment — find and update it
        handle_updated_comment(object)

      %{"type" => type} = object when type in ["Note", "Article", "Page"] ->
        # Re-use ingestion path; upsert will update existing
        handle_incoming_note(object, activity["actor"])

      _ ->
        :ok
    end

    :ok
  end

  defp handle_updated_comment(note) do
    ap_id = note["id"]

    case Repo.get_by(Comment, ap_id: ap_id) do
      nil ->
        Logger.debug("Update: comment not found by ap_id #{ap_id}, ignoring")

      comment ->
        # Bypass the 24-hour edit window — federated edits come from the author's server
        case comment |> Comment.edit_changeset(%{body_html: Inkwell.HtmlSanitizer.sanitize(note["content"] || "")}) |> Repo.update() do
          {:ok, _} ->
            Logger.info("Updated federated comment #{ap_id}")

          {:error, reason} ->
            Logger.warning("Failed to update federated comment #{ap_id}: #{inspect(reason)}")
        end
    end
  end

  @doc """
  Public entry point for the reply-backfill module to ingest a fediverse reply
  Note as if it had arrived via the inbox. Used only by
  `Inkwell.Federation.ReplyBackfill` for one-time recovery of replies that
  were dropped before the comment-lookup fix landed.
  """
  def process_incoming_reply_for_backfill(note, actor_uri) when is_map(note) and is_binary(actor_uri) do
    handle_incoming_reply(note, actor_uri)
  end

  def process_incoming_reply_for_backfill(_, _), do: :error

  defp handle_incoming_reply(note, actor_uri) do
    # Accept all replies to known local entries regardless of visibility scope.
    # Many Mastodon replies are "unlisted" (addressed to author + followers, no Public URI).
    # Per FEP-7458: inReplyTo indicates the relationship — if they're replying
    # to our content, we should accept it.
    in_reply_to = note["inReplyTo"]
    Logger.info("handle_incoming_reply: inReplyTo=#{in_reply_to}, actor=#{actor_uri}, note_id=#{note["id"]}")

    case find_entry_by_ap_url(in_reply_to) do
      nil ->
        # Not a reply to an entry — try comment lookup (for replies-to-comments,
        # i.e. nested fediverse threads), then guestbook
        case find_comment_by_ap_url(in_reply_to) do
          nil ->
            Logger.info("handle_incoming_reply: no local entry/comment found for #{in_reply_to}, checking guestbook")
            case find_guestbook_owner(in_reply_to) do
              nil ->
                Logger.info("Ignoring reply to unknown content: #{in_reply_to}")

              user ->
                handle_guestbook_reply(note, actor_uri, user)
            end

          parent_comment ->
            handle_reply_to_comment(note, actor_uri, parent_comment)
        end

      entry ->
        handle_reply_to_entry(note, actor_uri, entry)
    end
  end

  # Reply targets a local entry — create a top-level federated comment on the entry.
  defp handle_reply_to_entry(note, actor_uri, entry) do
    Logger.info("handle_incoming_reply: matched entry #{entry.id} (#{entry.title})")

    if reply_already_ingested?(note["id"]) do
      Logger.info("Skipping duplicate reply (ap_id=#{note["id"]}) on entry #{entry.id}")
    else
      do_handle_reply_to_entry(note, actor_uri, entry)
    end
  end

  defp do_handle_reply_to_entry(note, actor_uri, entry) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        profile_url = remote_actor_profile_url(remote_actor)

        # Use string keys throughout — `Journals.create_comment/1`'s
        # depth-enforcement step adds string keys, and Ecto rejects mixed maps.
        comment_attrs = %{
          "entry_id" => entry.id,
          "body_html" => Inkwell.HtmlSanitizer.sanitize(note["content"] || ""),
          "ap_id" => note["id"],
          "remote_author" => build_remote_author_data(remote_actor, profile_url)
        }

        case Journals.create_comment(comment_attrs) do
          {:ok, comment} ->
            Logger.info("Created federated comment #{comment.id} on entry #{entry.id} from #{actor_uri}")
            create_reply_notification(entry, remote_actor)

          {:error, reason} ->
            Logger.warning("Failed to create federated comment: #{inspect(reason)}")
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch remote actor #{actor_uri}: #{inspect(reason)}")
    end
  end

  # Reply targets one of our comments — create a threaded reply, inheriting the
  # entry/remote_entry context from the parent comment. Notifies the parent's
  # local author (if any) so they see the response in their notifications feed.
  defp handle_reply_to_comment(note, actor_uri, parent_comment) do
    target_label =
      cond do
        parent_comment.entry_id -> "entry:#{parent_comment.entry_id}"
        parent_comment.remote_entry_id -> "remote_entry:#{parent_comment.remote_entry_id}"
        true -> "(no entry context)"
      end

    Logger.info("handle_incoming_reply: matched comment #{parent_comment.id} (parent target: #{target_label})")

    if reply_already_ingested?(note["id"]) do
      Logger.info("Skipping duplicate reply-to-comment (ap_id=#{note["id"]}) parent=#{parent_comment.id}")
    else
      do_handle_reply_to_comment(note, actor_uri, parent_comment)
    end
  end

  defp do_handle_reply_to_comment(note, actor_uri, parent_comment) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        profile_url = remote_actor_profile_url(remote_actor)

        # String keys throughout: `Journals.create_comment/1`'s
        # `compute_and_enforce_depth/1` adds `"depth"` and `"parent_comment_id"`
        # as strings, and Ecto's cast rejects maps that mix atom and string keys.
        comment_attrs = %{
          "body_html" => Inkwell.HtmlSanitizer.sanitize(note["content"] || ""),
          "ap_id" => note["id"],
          "parent_comment_id" => parent_comment.id,
          "entry_id" => parent_comment.entry_id,
          "remote_entry_id" => parent_comment.remote_entry_id,
          "remote_author" => build_remote_author_data(remote_actor, profile_url)
        }

        case Journals.create_comment(comment_attrs) do
          {:ok, comment} ->
            Logger.info("Created federated reply-to-comment #{comment.id} parent=#{parent_comment.id} from #{actor_uri}")
            maybe_notify_parent_comment_author(parent_comment, remote_actor, profile_url)

          {:error, reason} ->
            Logger.warning("Failed to create federated reply-to-comment: #{inspect(reason)}")
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch remote actor #{actor_uri}: #{inspect(reason)}")
    end
  end

  # Idempotency guard: skip ingesting a reply if we already have a comment with
  # that AP id. Protects against (a) duplicate inbox deliveries from Mastodon,
  # (b) Oban worker retries, and (c) the backfill module re-discovering replies
  # whose Mastodon-API URL didn't match our stored ap_id format.
  defp reply_already_ingested?(nil), do: false

  defp reply_already_ingested?(ap_id) when is_binary(ap_id) do
    Repo.exists?(from c in Comment, where: c.ap_id == ^ap_id)
  end

  defp remote_actor_profile_url(%{raw_data: %{"url" => url}}) when is_binary(url), do: url
  defp remote_actor_profile_url(remote_actor), do: remote_actor.ap_id

  defp build_remote_author_data(remote_actor, profile_url) do
    %{
      ap_id: remote_actor.ap_id,
      username: remote_actor.username,
      domain: remote_actor.domain,
      display_name: remote_actor.display_name,
      avatar_url: remote_actor.avatar_url,
      profile_url: profile_url
    }
  end

  # Notify the local author of the parent comment that a fediverse user replied.
  # Skip silently if the parent is itself a remote comment (no local user to notify).
  defp maybe_notify_parent_comment_author(%Comment{user_id: user_id} = parent, remote_actor, profile_url)
       when not is_nil(user_id) do
    {target_type, target_id} =
      cond do
        parent.entry_id -> {"entry", parent.entry_id}
        parent.remote_entry_id -> {"remote_entry", parent.remote_entry_id}
        true -> {nil, nil}
      end

    Accounts.create_notification(%{
      user_id: user_id,
      type: :reply,
      target_type: target_type,
      target_id: target_id,
      data: %{
        parent_comment_id: parent.id,
        remote_actor: %{
          display_name: remote_actor.display_name || remote_actor.username,
          username: remote_actor.username,
          domain: remote_actor.domain,
          avatar_url: remote_actor.avatar_url,
          profile_url: profile_url,
          ap_id: remote_actor.ap_id
        }
      }
    })
  end

  defp maybe_notify_parent_comment_author(_parent, _remote_actor, _profile_url), do: :ok

  # ── Standalone Note ingestion ───────────────────────────────────────────

  defp handle_incoming_note(note, actor_uri) do
    to = note["to"] || []
    cc = note["cc"] || []
    public_uri = "https://www.w3.org/ns/activitystreams#Public"

    is_public = public_uri in to || public_uri in cc

    if is_public do
      case RemoteActor.fetch(actor_uri) do
        {:ok, remote_actor} ->
          tags = extract_hashtags(note["tag"])

          url =
            case note["url"] do
              u when is_binary(u) -> u
              _ -> note["id"]
            end

          # Parse sensitivity flag (Mastodon/fediverse standard)
          is_sensitive = note["sensitive"] == true
          content_warning = if is_sensitive, do: note["summary"], else: nil

          body_html =
            (note["content"] || "")
            |> Inkwell.HtmlSanitizer.sanitize()
            |> Inkwell.Federation.AttachmentHelper.append_image_attachments(note)

          attrs = %{
            ap_id: note["id"],
            url: url,
            title: Inkwell.HtmlSanitizer.sanitize(note["name"]),
            body_html: body_html,
            tags: tags,
            published_at: parse_ap_datetime(note["published"]),
            remote_actor_id: remote_actor.id,
            sensitive: is_sensitive,
            content_warning: content_warning,
            reply_count: Inkwell.Federation.ReplyFetcher.extract_reply_count(note["replies"])
          }

          case RemoteEntries.upsert_remote_entry(attrs) do
            {:ok, :self_domain_skipped} ->
              Logger.debug("Skipping self-domain entry #{note["id"]}")

            {:ok, remote_entry} ->
              Logger.info("Stored remote entry #{note["id"]} from #{actor_uri}")

              # Enqueue link preview enrichment
              %{remote_entry_id: remote_entry.id}
              |> Inkwell.Workers.LinkPreviewWorker.new()
              |> Oban.insert()

            {:error, reason} ->
              Logger.warning("Failed to store remote entry: #{inspect(reason)}")
          end

        {:error, reason} ->
          Logger.warning("Failed to fetch actor for note: #{inspect(reason)}")
      end
    end
  end

  defp extract_hashtags(nil), do: []

  defp extract_hashtags(tags) when is_list(tags) do
    tags
    |> Enum.filter(fn t -> is_map(t) && t["type"] == "Hashtag" end)
    |> Enum.map(fn t ->
      (t["name"] || "") |> String.trim_leading("#") |> String.downcase()
    end)
    |> Enum.reject(&(&1 == ""))
  end

  defp extract_hashtags(_), do: []

  defp parse_ap_datetime(nil), do: nil

  defp parse_ap_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end

  # ── Like handling ───────────────────────────────────────────────────────

  defp handle_like(activity, _target_user) do
    object_uri = activity["object"]
    actor_uri = activity["actor"]
    like_id = activity["id"]

    if is_binary(object_uri) do
      case find_entry_by_ap_url(object_uri) do
        nil ->
          :ok

        entry ->
          case RemoteActor.fetch(actor_uri) do
            {:ok, remote_actor} ->
              case Inkwell.Inks.create_remote_ink(remote_actor.id, entry.id, like_id) do
                {:ok, {:created, _ink}} ->
                  create_ink_notification(entry, remote_actor)
                  Logger.info("Received federated ink on entry #{entry.id} from #{actor_uri}")

                {:ok, :existing} ->
                  Logger.info("Duplicate Like from #{actor_uri} on entry #{entry.id}, skipping")

                {:error, reason} ->
                  Logger.warning("Failed to create federated ink: #{inspect(reason)}")
              end

            _ ->
              :ok
          end
      end
    end

    :ok
  end

  # ── Announce handling (inbound boost → ink) ─────────────────────────

  defp handle_announce(activity, _target_user) do
    # Announce object can be a bare string URI or %{"id" => id}
    object_uri =
      case activity["object"] do
        uri when is_binary(uri) -> uri
        %{"id" => id} when is_binary(id) -> id
        _ -> nil
      end

    actor_uri = activity["actor"]
    announce_id = activity["id"]

    if is_binary(object_uri) do
      case find_entry_by_ap_url(object_uri) do
        nil ->
          # Not a local entry — check if this is a relay-sourced Announce
          if Relays.is_relay_actor?(actor_uri) do
            %{object_uri: object_uri, relay_actor_uri: actor_uri}
            |> RelayContentWorker.new()
            |> Oban.insert()

            Logger.info("Enqueued relay content fetch for #{object_uri} from #{actor_uri}")
          end

        entry ->
          case RemoteActor.fetch(actor_uri) do
            {:ok, remote_actor} ->
              # Create a reprint record (Announce = repost, not endorsement)
              case Inkwell.Reprints.create_remote_reprint(remote_actor.id, entry.id, announce_id) do
                {:ok, {:created, _reprint}} ->
                  Accounts.create_notification(%{
                    type: :reprint,
                    user_id: entry.user_id,
                    target_type: "entry",
                    target_id: entry.id,
                    data: %{
                      remote_actor: %{
                        display_name: remote_actor.display_name,
                        username: remote_actor.username,
                        domain: remote_actor.domain,
                        avatar_url: remote_actor.avatar_url,
                        profile_url: remote_actor.ap_id,
                        ap_id: remote_actor.ap_id
                      }
                    }
                  })
                  Logger.info("Received federated reprint on entry #{entry.id} from #{actor_uri}")

                {:ok, :existing} ->
                  Logger.info("Duplicate Announce from #{actor_uri} on entry #{entry.id}, skipping")

                {:error, reason} ->
                  Logger.warning("Failed to create remote reprint: #{inspect(reason)}")
              end

            _ ->
              :ok
          end
      end
    end

    :ok
  end

  # ── Delete handling ─────────────────────────────────────────────────────

  defp handle_delete(activity, _target_user) do
    object_id =
      case activity["object"] do
        %{"id" => id} -> id
        id when is_binary(id) -> id
        _ -> nil
      end

    if object_id do
      # Try deleting a federated comment
      case Repo.get_by(Inkwell.Journals.Comment, ap_id: object_id) do
        nil -> :ok
        comment ->
          Repo.delete(comment)
          Logger.info("Deleted federated comment #{object_id}")
      end

      # Also try deleting a remote entry
      case RemoteEntries.delete_by_ap_id(object_id) do
        {:ok, nil} -> :ok
        {:ok, _} -> Logger.info("Deleted remote entry #{object_id}")
        {:error, _} -> :ok
      end

      # Also try deleting a federated guestbook entry
      Inkwell.Guestbook.delete_by_ap_id(object_id)
    end

    :ok
  end

  # ── Notification helpers ────────────────────────────────────────────────

  defp create_reply_notification(entry, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    Accounts.create_notification(%{
      user_id: entry.user_id,
      type: :comment,
      target_type: "entry",
      target_id: entry.id,
      data: %{
        entry_id: entry.id,
        entry_title: entry.title,
        remote_actor: %{
          display_name: remote_actor.display_name || remote_actor.username,
          username: remote_actor.username,
          domain: remote_actor.domain,
          avatar_url: remote_actor.avatar_url,
          profile_url: profile_url,
          ap_id: remote_actor.ap_id
        }
      }
    })
  end

  defp create_ink_notification(entry, remote_actor) do
    # Dedup: skip if a recent ink notification already exists for this entry
    if Accounts.recent_notification_exists?(entry.user_id, :ink, nil, entry.id) do
      Logger.info("Skipping duplicate ink notification for entry #{entry.id} from #{remote_actor.ap_id}")
    else
      do_create_ink_notification(entry, remote_actor)
    end
  end

  defp do_create_ink_notification(entry, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    Accounts.create_notification(%{
      user_id: entry.user_id,
      type: :ink,
      target_type: "entry",
      target_id: entry.id,
      data: %{
        entry_id: entry.id,
        entry_title: entry.title,
        remote_actor: %{
          display_name: remote_actor.display_name || remote_actor.username,
          username: remote_actor.username,
          domain: remote_actor.domain,
          avatar_url: remote_actor.avatar_url,
          profile_url: profile_url,
          ap_id: remote_actor.ap_id
        }
      }
    })
  end

  # ── Fediverse mention notification ──────────────────────────────────────

  # Shared inbox (target_user nil) — scan Mention tags for any local users
  defp maybe_create_mention_notification(object, actor_uri, nil) do
    tags = object["tag"] || []

    mention_hrefs =
      tags
      |> Enum.filter(fn
        %{"type" => "Mention", "href" => href} when is_binary(href) -> true
        _ -> false
      end)
      |> Enum.map(fn %{"href" => href} -> href end)

    if mention_hrefs != [] do
      # Extract usernames from mention hrefs that match our domain
      frontend_host = Application.get_env(:inkwell, :frontend_url) || ""
      api_host = InkwellWeb.Endpoint.url()

      local_users =
        mention_hrefs
        |> Enum.flat_map(fn href ->
          username = extract_local_username(href, api_host, frontend_host)
          if username, do: [username], else: []
        end)
        |> Enum.uniq()
        |> Enum.flat_map(fn username ->
          case Accounts.get_user_by_username(username) do
            nil -> []
            user -> [user]
          end
        end)

      Enum.each(local_users, fn user ->
        create_mention_notification_for_user(object, actor_uri, user)
      end)
    end

    :ok
  end

  # Personal inbox — check if mention tags target the inbox owner
  defp maybe_create_mention_notification(object, actor_uri, target_user) do
    tags = object["tag"] || []
    frontend_host = Application.get_env(:inkwell, :frontend_url) || ""
    api_host = InkwellWeb.Endpoint.url()

    # Check if any Mention tag targets the inbox owner's actor URL
    user_actor_url = "#{api_host}/users/#{target_user.username}"
    user_frontend_url = "#{frontend_host}/users/#{target_user.username}"

    mentions_user =
      Enum.any?(tags, fn
        %{"type" => "Mention", "href" => href} when is_binary(href) ->
          href == user_actor_url or href == user_frontend_url

        _ ->
          false
      end)

    if mentions_user do
      create_mention_notification_for_user(object, actor_uri, target_user)
    end

    :ok
  end

  # Extract a local username from a mention href URL
  defp extract_local_username(href, api_host, frontend_host) do
    cond do
      String.starts_with?(href, "#{api_host}/users/") ->
        String.replace_prefix(href, "#{api_host}/users/", "")

      String.starts_with?(href, "#{frontend_host}/users/") ->
        String.replace_prefix(href, "#{frontend_host}/users/", "")

      true ->
        nil
    end
  end

  # Create a fediverse_mention notification for a specific user
  defp create_mention_notification_for_user(object, actor_uri, user) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        profile_url =
          case remote_actor.raw_data do
            %{"url" => url} when is_binary(url) -> url
            _ -> remote_actor.ap_id
          end

        content_preview =
          (object["content"] || "")
          |> String.replace(~r/<[^>]+>/, "")
          |> String.slice(0, 200)

        post_url =
          case object do
            %{"url" => url} when is_binary(url) -> url
            %{"id" => id} when is_binary(id) -> id
            _ -> nil
          end

        Accounts.create_notification(%{
          user_id: user.id,
          type: :fediverse_mention,
          data: %{
            remote_actor: %{
              display_name: remote_actor.display_name || remote_actor.username,
              username: remote_actor.username,
              domain: remote_actor.domain,
              avatar_url: remote_actor.avatar_url,
              profile_url: profile_url,
              ap_id: remote_actor.ap_id
            },
            content_preview: content_preview,
            post_url: post_url
          }
        })

      {:error, reason} ->
        Logger.warning("Failed to fetch actor for mention notification: #{inspect(reason)}")
    end
  end

  # ── Entry lookup helper ──────────────────────────────────────────────────

  # Find an entry by AP URL, handling multiple URL patterns:
  # 1. Direct ap_id match (e.g. https://inkwell-api.fly.dev/entries/{uuid})
  # 2. /entries/{uuid} path pattern
  # 3. Slug-based URLs (e.g. https://inkwell.social/username/slug) — this is what
  #    Mastodon uses for inReplyTo when replying to entries it discovered via slug URL
  defp find_entry_by_ap_url(url) when is_binary(url) do
    # First: try direct ap_id match
    case Repo.get_by(Inkwell.Journals.Entry, ap_id: url) do
      nil ->
        # Try extracting the entry UUID from the URL path
        # Pattern: https://host/entries/{uuid}
        case Regex.run(~r|/entries/([0-9a-f-]{36})|, url) do
          [_, id] ->
            Repo.get(Inkwell.Journals.Entry, id)

          _ ->
            # Try slug-based URL pattern: https://host/username/slug
            # Mastodon stores the Article's `url` field as inReplyTo
            find_entry_by_slug_url(url)
        end

      entry ->
        entry
    end
  end

  defp find_entry_by_ap_url(_), do: nil

  # Find a comment by AP URL. Used for inbound replies-to-comments (nested
  # fediverse threads) where Mastodon's `inReplyTo` points to one of our
  # comment URLs (e.g. `https://inkwell.social/comments/{uuid}`).
  #
  # Note on URL matching: our outbound activity builder constructs comment
  # URLs as `{host}/comments/{comment.id}` (using the DB UUID), which is what
  # Mastodon stores and uses when replying. The `ap_id` column in our DB,
  # however, can hold a *different* generated UUID/integer (legacy quirk in
  # comment_controller and remote_entry_controller). So we extract the UUID
  # from the URL path and match by DB id, which is reliable for both old and
  # new comments.
  defp find_comment_by_ap_url(url) when is_binary(url) do
    case Repo.get_by(Comment, ap_id: url) do
      nil ->
        case Regex.run(~r|/comments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$|, url) do
          [_, id] ->
            case Ecto.UUID.cast(id) do
              {:ok, valid_id} -> Repo.get(Comment, valid_id)
              :error -> nil
            end

          _ ->
            nil
        end

      comment ->
        comment
    end
  end

  defp find_comment_by_ap_url(_), do: nil

  # Match slug URLs like https://inkwell.social/username/slug
  # The path has exactly 2 segments: /{username}/{slug}
  defp find_entry_by_slug_url(url) do
    uri = URI.parse(url)

    case uri.path do
      nil -> nil
      path ->
        segments = path |> String.trim_leading("/") |> String.split("/")

        case segments do
          [username, slug] when username != "" and slug != "" ->
            case Accounts.get_user_by_username(username) do
              nil -> nil
              user -> Journals.get_entry_by_slug(user.id, slug)
            end

          _ -> nil
        end
    end
  end

  # ── Guestbook reply handling ────────────────────────────────────────────

  # Match URLs like https://host/users/username/guestbook-post
  defp find_guestbook_owner(url) when is_binary(url) do
    uri = URI.parse(url)

    case uri.path do
      nil ->
        nil

      path ->
        case path |> String.trim_leading("/") |> String.split("/") do
          ["users", username, "guestbook-post"] when username != "" ->
            Accounts.get_user_by_username(username)

          _ ->
            nil
        end
    end
  end

  defp find_guestbook_owner(_), do: nil

  defp handle_guestbook_reply(note, actor_uri, profile_user) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        profile_url =
          case remote_actor.raw_data do
            %{"url" => url} when is_binary(url) -> url
            _ -> remote_actor.ap_id
          end

        # Strip HTML to plain text and truncate to 500 chars
        body =
          (note["content"] || "")
          |> String.replace(~r/<[^>]+>/, "")
          |> String.trim()
          |> String.slice(0, 500)

        attrs = %{
          body: body,
          profile_user_id: profile_user.id,
          ap_id: note["id"],
          remote_author: %{
            ap_id: remote_actor.ap_id,
            username: remote_actor.username,
            domain: remote_actor.domain,
            display_name: remote_actor.display_name,
            avatar_url: remote_actor.avatar_url,
            profile_url: profile_url
          }
        }

        case Inkwell.Guestbook.create_entry_from_ap(attrs) do
          {:ok, _entry} ->
            Logger.info("Created federated guestbook entry from #{remote_actor.username}@#{remote_actor.domain}")

            # Create notification for the profile owner
            Accounts.create_notification(%{
              user_id: profile_user.id,
              type: :guestbook,
              data: %{
                profile_username: profile_user.username,
                remote_actor: %{
                  display_name: remote_actor.display_name || remote_actor.username,
                  username: remote_actor.username,
                  domain: remote_actor.domain,
                  avatar_url: remote_actor.avatar_url,
                  profile_url: profile_url,
                  ap_id: remote_actor.ap_id
                }
              }
            })

          {:error, reason} ->
            Logger.warning("Failed to create federated guestbook entry: #{inspect(reason)}")
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch actor for guestbook reply: #{inspect(reason)}")
    end
  end

  # ── Config helper ───────────────────────────────────────────────────────

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key, default_config(key))
  end

  defp default_config(:instance_host), do: "inkwell-api.fly.dev"
  defp default_config(:frontend_host), do: "https://inkwell.social"
  defp default_config(_), do: nil
end
