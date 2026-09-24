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
  #
  # NodeInfo describes the *server*. Custom domains (a Plus member's vanity
  # address for their profile) reach these routes too, and answering there
  # made stats sites list each one as a separate Inkwell server reporting the
  # whole instance's user count. The Next.js proxy forwards the requested host
  # in X-Original-Host; on a custom domain every NodeInfo route 404s.
  def nodeinfo(conn, _params) do
    if custom_domain_request?(conn) do
      nodeinfo_not_found(conn)
    else
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
  end

  # GET /nodeinfo/2.0
  # 2.0 differs from 2.1: software{} cannot include homepage/repository,
  # and services{} is required (we bridge to nothing, so both are []).
  def nodeinfo_schema_20(conn, _params) do
    if custom_domain_request?(conn) do
      nodeinfo_not_found(conn)
    else
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
        usage: nodeinfo_stats(),
        openRegistrations: true,
        metadata: nodeinfo_metadata()
      })
    end
  end

  # GET /nodeinfo/2.1
  def nodeinfo_schema(conn, _params) do
    if custom_domain_request?(conn) do
      nodeinfo_not_found(conn)
    else
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
        usage: nodeinfo_stats(),
        openRegistrations: true,
        metadata: nodeinfo_metadata()
      })
    end
  end

  defp custom_domain_request?(conn) do
    case get_req_header(conn, "x-original-host") do
      [host | _] -> Inkwell.CustomDomains.custom_domain_host?(host)
      _ -> false
    end
  end

  defp nodeinfo_not_found(conn) do
    conn |> put_status(:not_found) |> json(%{error: "not_found"})
  end

  # FEP-0151 `metadata`: the widely used, non-standardized properties.
  # staffAccounts are the admins' actor IDs (the people accountable for the
  # server), so remote admins know whom to contact.
  defp nodeinfo_metadata do
    %{
      nodeName: Application.get_env(:inkwell, :instance_name, "Inkwell"),
      nodeDescription:
        Application.get_env(
          :inkwell,
          :instance_description,
          "A social journal. No algorithms, no ads."
        ),
      staffAccounts: Enum.map(Accounts.list_admins(), &ActivityBuilder.actor_url/1),
      federation: %{enabled: true}
    }
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

  # FEP-0151: servers MUST NOT publish skewed usage statistics. These count
  # real people and their real writing:
  #   * users — excludes suspended accounts (mostly spam) and the relay
  #     instance actor, which is a machine, not a member
  #   * localPosts — published entries only (no drafts, no entries hidden by
  #     moderation)
  #   * localComments — comments written here, not fediverse replies we store
  @doc false
  def compute_nodeinfo_stats do
    members =
      from(u in Inkwell.Accounts.User,
        where: is_nil(u.blocked_at) and u.username != ^Inkwell.Federation.InstanceActor.username()
      )

    published =
      from(e in Inkwell.Journals.Entry,
        join: u in subquery(members),
        on: u.id == e.user_id,
        where: e.status == :published
      )

    user_count = Repo.aggregate(members, :count)
    post_count = Repo.aggregate(published, :count)

    comment_count =
      from(c in Comment, where: is_nil(c.remote_author))
      |> Repo.aggregate(:count)

    now = DateTime.utc_now()
    six_months_ago = DateTime.add(now, -180, :day)
    one_month_ago = DateTime.add(now, -30, :day)

    active_since = fn since ->
      from(e in published, where: e.inserted_at >= ^since, select: count(e.user_id, :distinct))
      |> Repo.one()
    end

    %{
      users: %{
        total: user_count,
        activeHalfyear: active_since.(six_months_ago),
        activeMonth: active_since.(one_month_ago)
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

  # ── Comment object endpoint ─────────────────────────────────────────────

  # GET /comments/:id — a comment written on Inkwell, as the AP Note we
  # federated. Remote servers look these up to resolve threads (a reply to our
  # comment points `inReplyTo` here); people who follow the link land on the
  # conversation. Only comments that are public on Inkwell are served.
  def comment_object(conn, %{"id" => id}) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         %Comment{user_id: user_id} = comment when not is_nil(user_id) <- Repo.get(Comment, id),
         comment = Repo.preload(comment, [:user, :entry, :remote_entry, :parent_comment]),
         true <- is_nil(comment.user.blocked_at),
         {:ok, root_ap_id, page_url} <- comment_context(comment) do
      in_reply_to =
        if comment.parent_comment,
          do: ActivityBuilder.comment_reply_target(comment.parent_comment),
          else: root_ap_id

      if ap_request?(conn) do
        conn
        |> put_resp_content_type("application/activity+json")
        |> json(ActivityBuilder.build_comment_note(comment, comment.user, in_reply_to, page_url))
      else
        redirect(conn, external: page_url)
      end
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  defp comment_context(%Comment{entry: %Journals.Entry{} = entry}) do
    if entry.status == :published and entry.privacy == :public do
      author = Accounts.get_user!(entry.user_id)
      frontend_host = federation_config(:frontend_host)

      {:ok, entry.ap_id || ActivityBuilder.entry_ap_url(entry),
       "#{frontend_host}/#{author.username}/#{entry.slug}#comments"}
    else
      :error
    end
  end

  defp comment_context(%Comment{remote_entry: %{} = remote_entry}) do
    {:ok, remote_entry.ap_id,
     "#{federation_config(:frontend_host)}/fediverse/#{remote_entry.id}#comments"}
  end

  defp comment_context(_), do: :error

  defp ap_request?(conn) do
    accept = conn |> get_req_header("accept") |> List.first() || ""
    String.contains?(accept, "application/activity+json") or String.contains?(accept, "application/ld+json")
  end

  # ── Featured collection (pinned posts) ─────────────────────────────────

  # How many posts the featured collection offers (Mastodon's own pin limit).
  @featured_limit 5

  # GET /users/:username/featured
  #
  # Mastodon never backfills an account's older posts when it first discovers
  # it, so a new writer's profile looked empty there until someone followed and
  # they posted again. What Mastodon *does* fetch on discovery is this
  # collection. It lists the writer's pinned entries, then fills up with their
  # latest public entries so every profile shows something.
  #
  # Items are entry URIs, not inline objects: Mastodon only accepts links or
  # inline Notes here and silently drops inline Articles.
  def featured(conn, %{"username" => username}) do
    instance_host = federation_config(:instance_host)

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "")

      user ->
        items =
          user
          |> featured_entries()
          |> Enum.map(&ActivityBuilder.entry_ap_url/1)

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

  defp featured_entries(%{blocked_at: blocked_at}) when not is_nil(blocked_at), do: []

  defp featured_entries(user) do
    public =
      from(e in Inkwell.Journals.Entry,
        where: e.user_id == ^user.id and e.status == :published and e.privacy == :public
      )

    pinned_ids =
      (user.pinned_entry_ids || [])
      |> Enum.filter(&match?({:ok, _}, Ecto.UUID.cast(&1)))

    pinned =
      if pinned_ids == [] do
        []
      else
        by_id = public |> where([e], e.id in ^pinned_ids) |> Repo.all() |> Map.new(&{&1.id, &1})
        pinned_ids |> Enum.map(&by_id[&1]) |> Enum.reject(&is_nil/1)
      end

    recent =
      case @featured_limit - length(pinned) do
        n when n > 0 ->
          taken = Enum.map(pinned, & &1.id)

          # Quote reprints are mostly someone else's post; only feature them if pinned.
          public
          |> where([e], e.id not in ^taken)
          |> where([e], is_nil(e.quoted_entry_id) and is_nil(e.quoted_remote_entry_id))
          |> order_by([e], desc: e.published_at, desc: e.inserted_at)
          |> limit(^n)
          |> Repo.all()

        _ ->
          []
      end

    Enum.take(pinned ++ recent, @featured_limit)
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
            track_rejection(:domain_mismatch)
            conn |> put_status(:unauthorized) |> json(%{error: "Actor domain mismatch"})
        end

      {:error, reason} ->
        if delete_from_gone_actor?(params, reason) do
          accept_gone_actor_delete(conn, params)
        else
          Logger.warning("Inbox: rejected #{params["type"] || "unknown"} from #{params["actor"] || "unknown"} to /users/#{username}/inbox — #{inspect(reason)}")
          track_rejection(reason)
          conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
        end
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
            track_rejection(:domain_mismatch)
            conn |> put_status(:unauthorized) |> json(%{error: "Actor domain mismatch"})
        end

      {:error, reason} ->
        if delete_from_gone_actor?(params, reason) do
          accept_gone_actor_delete(conn, params)
        else
          Logger.warning("Shared inbox: rejected #{params["type"] || "unknown"} from #{params["actor"] || "unknown"} — #{inspect(reason)}")
          track_rejection(reason)
          conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
        end
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
        # Log what we actually received. A Signature header we cannot parse means
        # the sender is using a scheme we do not implement (e.g. RFC 9421 HTTP
        # Message Signatures, which look like `sig1=:base64:` and carry their
        # metadata in a separate Signature-Input header) — the raw value is the
        # only way to tell which.
        Logger.warning(
          "Inbox: REJECTED — unparseable Signature header — #{inspect(reason)} " <>
            "raw=#{inspect(raw_signature_header(conn))} " <>
            "headers=#{inspect(request_header_names(conn))} " <>
            "ua=#{inspect(get_req_header_value(conn, "user-agent"))}"
        )

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
                        Logger.warning(
                          "Inbox: signature FAILED for #{actor_uri} after retry — #{inspect(reason)} " <>
                            "scheme=#{sig_parts["__scheme"] || "cavage"} " <>
                            "signature-input=#{inspect(get_req_header_value(conn, "signature-input"))}"
                        )

                        {:error, reason}
                    end

                  {:error, reason} ->
                    Logger.info("Inbox: could not re-fetch actor #{actor_uri} — #{inspect(reason)}")
                    {:error, reason}
                end
            end

          {:error, reason} ->
            # Not a verdict: the caller decides. A `Delete` from an account whose
            # server now answers 410 is expected, and is accepted rather than refused.
            Logger.info("Inbox: could not fetch actor #{actor_uri} — #{inspect(reason)}")
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

  # A deleted account is the one case where a signature can never be verified and
  # never will be: the account broadcasts `Delete`, and by the time it reaches us
  # its server already answers 404/410 for the key we would check it against.
  #
  # Refusing these with a 401 does not make us safer — we take no action on an
  # activity we cannot verify either way — but it does tell the sender to keep
  # trying, and Mastodon then redelivers with backoff for days. Four gone accounts
  # accounted for 106 of 113 refusals in one sample, each retried roughly 25 times.
  # Accepting and dropping them ends that, which is what Mastodon itself does.
  @doc false
  def delete_from_gone_actor?(params, reason) do
    params["type"] == "Delete" and reason in [{:http_error, 404}, {:http_error, 410}]
  end

  @doc """
  The actor an unverifiable `Delete` may purge, or `nil` when it may purge nothing.

  Only an account deleting *itself* qualifies, and only when the key that signed
  the request belongs to that same account — the one whose server has just told
  us it is gone. A `Delete` naming anyone else is dropped unprocessed.
  """
  def self_delete_target(params, key_actor_uri) do
    actor = params["actor"]

    if is_binary(actor) and actor != "" and activity_object_id(params["object"]) == actor and
         key_actor_uri == actor do
      actor
    end
  end

  defp accept_gone_actor_delete(conn, params) do
    actor = params["actor"]
    Logger.info("Inbox: accepting unverifiable Delete from gone actor #{actor || "(unknown)"}")
    Inkwell.Federation.FederationStats.track_inbound("delete_from_gone_actor")

    # Only when the account is deleting *itself* do we act on it, and only on the
    # actor its own server has confirmed is gone. An activity claiming to delete
    # somebody else is dropped unprocessed — nothing here trusts the payload.
    case self_delete_target(params, key_actor_uri(conn)) do
      nil -> :ok
      target -> purge_gone_actor(target)
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  defp purge_gone_actor(actor_uri) do
    case RemoteActor.get_by_ap_id(actor_uri) do
      nil ->
        :ok

      actor ->
        # Cascades to the actor's cached posts, follows, inks and reprints.
        Repo.delete(actor)
        Logger.info("Purged deleted remote actor #{actor_uri} and their cached content")
    end
  rescue
    e ->
      Logger.warning("Could not purge remote actor #{actor_uri}: #{inspect(e)}")
      :ok
  end

  # The actor the signing key belongs to, without dereferencing anything — a
  # fragment keyId (`…/users/alice#main-key`) is the actor with the fragment
  # removed. Path-style keyIds are left alone, so they simply will not match and
  # nothing is purged.
  defp key_actor_uri(conn) do
    with {:ok, sig_parts} <- HttpSignature.parse_signature(conn),
         key_id when is_binary(key_id) <- sig_parts["keyId"] do
      case URI.parse(key_id) do
        %URI{fragment: nil} -> key_id
        uri -> %{uri | fragment: nil} |> URI.to_string()
      end
    else
      _ -> nil
    end
  end

  defp activity_object_id(%{"id" => id}) when is_binary(id), do: id
  defp activity_object_id(id) when is_binary(id), do: id
  defp activity_object_id(_), do: nil

  # Records why an inbound activity was turned away, so the federation dashboard
  # distinguishes "we cannot read this sender's signature scheme" from "this
  # signature is forged" from "this actor no longer exists". All of these used
  # to land in a single `rejected_signature` bucket.
  defp track_rejection(reason) do
    Inkwell.Federation.FederationStats.track_inbound("rejected_" <> rejection_label(reason))
  end

  defp rejection_label(reason) when is_atom(reason), do: Atom.to_string(reason)
  defp rejection_label({:http_error, status}), do: "actor_fetch_#{status}"
  defp rejection_label({:failed_connect, _}), do: "actor_unreachable"
  defp rejection_label({kind, _}) when is_atom(kind), do: Atom.to_string(kind)
  defp rejection_label(_), do: "unknown"

  defp raw_signature_header(conn) do
    case Plug.Conn.get_req_header(conn, "signature") do
      [sig | _] -> String.slice(sig, 0, 400)
      [] -> nil
    end
  end

  defp request_header_names(conn) do
    conn.req_headers |> Enum.map(&elem(&1, 0)) |> Enum.sort()
  end

  defp get_req_header_value(conn, name) do
    case Plug.Conn.get_req_header(conn, name) do
      [val | _] -> val
      [] -> nil
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
         {:ok, remote_actor} <- RemoteActor.fetch(actor_uri),
         {:blocked, false} <- {:blocked, blocked_for_user?(target_user.id, remote_actor)} do

      case create_remote_follow(remote_actor, target_user) do
        {:ok, :created, _rel} ->
          # Auto-accept: send Accept activity back
          accept = ActivityBuilder.build_accept(activity, target_user)
          inbox = remote_actor.shared_inbox || remote_actor.inbox

          %{activity: accept, inbox_url: inbox, user_id: target_user.id}
          |> DeliverActivityWorker.new()
          |> Oban.insert()

          # Notify the Inkwell user about the new fediverse follower. Not for
          # the Bluesky bridge bot following back: Settings shows that instead.
          unless Inkwell.Federation.BlueskyBridge.bridge_actor?(remote_actor),
            do: create_fediverse_follow_notification(target_user, remote_actor)

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
      {:blocked, true} ->
        # No Accept: their server keeps it as a pending request forever.
        Logger.info("Ignoring follow from #{actor_uri}: blocked by @#{target_user.username}")
        :ok

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

    # A private message to one member becomes a letter (or a request). What
    # isn't one carries on below exactly as before.
    if Inkwell.Letters.Federation.receive_note(object, activity["actor"], target_user) == :handled do
      :ok
    else
      handle_create_object(object, activity, target_user, object_type)
    end
  end

  defp handle_create_object(object, activity, target_user, object_type) do
    case object do
      %{"type" => type, "inReplyTo" => reply_to}
          when type in ["Note", "Article", "Page"] and is_binary(reply_to) ->
        if publicly_addressed?(object) do
          # Reply to a local entry (Note, Article, or Page)
          handle_incoming_reply(object, activity["actor"])
        else
          # A followers-only or direct ("private mention") reply. Its author
          # chose who could read it, so it must not become a comment anyone
          # can see. The people it mentions get it as a private notification,
          # the same way a Mastodon direct message already arrives.
          Logger.info("handle_create: non-public reply #{inspect(object["id"])} delivered privately, not as a comment")
          maybe_create_mention_notification(object, activity["actor"], target_user)
        end

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
    case Inkwell.Letters.Federation.receive_update(activity["object"], activity["actor"]) do
      :handled -> :ok
      :not_a_letter -> handle_update_object(activity)
    end
  end

  defp handle_update_object(activity) do
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
    if publicly_addressed?(note) do
      do_handle_incoming_reply(note, actor_uri)
    else
      # Also reached from the reply backfill, which has no inbox owner to
      # notify. Never turn a followers-only or direct reply into a comment.
      Logger.info("handle_incoming_reply: skipping non-public reply #{inspect(note["id"])}")
      :ok
    end
  end

  @public_addresses [
    "https://www.w3.org/ns/activitystreams#Public",
    "as:Public",
    "Public"
  ]

  @doc """
  True when an object is addressed to the public collection, in `to` or `cc`.
  Public and unlisted posts are; followers-only and direct posts are not.
  Anything we display to people other than its addressees must pass this.
  """
  def publicly_addressed?(object) when is_map(object) do
    [object["to"], object["cc"]]
    |> List.flatten()
    |> Enum.any?(&(&1 in @public_addresses))
  end

  def publicly_addressed?(_), do: false

  # A local user's fediverse blocks (Settings → Blocked: an account or a whole
  # domain) and instance defederation. Checked wherever an inbound activity
  # would put something in front of that user.
  defp blocked_for_user?(nil, _remote_actor), do: false

  defp blocked_for_user?(user_id, remote_actor) do
    Inkwell.Moderation.FediverseBlocks.should_reject_actor?(
      user_id,
      remote_actor.id,
      remote_actor.domain || ""
    )
  end

  defp do_handle_incoming_reply(note, actor_uri) do
    # Public and unlisted replies to our content. Unlisted replies carry the
    # Public collection in `cc`, so they pass `publicly_addressed?/1`.
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
        if blocked_for_user?(entry.user_id, remote_actor) do
          Logger.info("Dropping reply from #{actor_uri}: blocked by the entry's author")
        else
          create_federated_entry_comment(note, entry, remote_actor)
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch remote actor #{actor_uri}: #{inspect(reason)}")
    end
  end

  defp create_federated_entry_comment(note, entry, remote_actor) do
    profile_url = remote_actor_profile_url(remote_actor)

    # Use string keys throughout — `Journals.create_comment/1`'s
    # depth-enforcement step adds string keys, and Ecto rejects mixed maps.
    comment_attrs = %{
      "entry_id" => entry.id,
      "body_html" => Inkwell.HtmlSanitizer.sanitize(note["content"] || ""),
      "ap_id" => note["id"],
      "url" => extract_note_url(note),
      "remote_author" => build_remote_author_data(remote_actor, profile_url)
    }

    case Journals.create_comment(comment_attrs) do
      {:ok, comment} ->
        Logger.info("Created federated comment #{comment.id} on entry #{entry.id} from #{remote_actor.ap_id}")
        create_reply_notification(entry, remote_actor)

      {:error, reason} ->
        Logger.warning("Failed to create federated comment: #{inspect(reason)}")
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
        if reply_to_comment_blocked?(parent_comment, remote_actor) do
          Logger.info("Dropping reply-to-comment from #{actor_uri}: blocked by the entry's author or the comment's author")
        else
          create_federated_comment_reply(note, parent_comment, remote_actor)
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch remote actor #{actor_uri}: #{inspect(reason)}")
    end
  end

  # The reply lands in the entry author's comments and in the parent comment
  # author's notifications; either one's block keeps it out.
  defp reply_to_comment_blocked?(parent_comment, remote_actor) do
    entry_owner_id =
      case parent_comment.entry_id && Repo.get(Inkwell.Journals.Entry, parent_comment.entry_id) do
        %{user_id: user_id} -> user_id
        _ -> nil
      end

    blocked_for_user?(entry_owner_id, remote_actor) or
      blocked_for_user?(parent_comment.user_id, remote_actor)
  end

  defp create_federated_comment_reply(note, parent_comment, remote_actor) do
    profile_url = remote_actor_profile_url(remote_actor)

    # String keys throughout: `Journals.create_comment/1`'s
    # `compute_and_enforce_depth/1` adds `"depth"` and `"parent_comment_id"`
    # as strings, and Ecto's cast rejects maps that mix atom and string keys.
    comment_attrs = %{
      "body_html" => Inkwell.HtmlSanitizer.sanitize(note["content"] || ""),
      "ap_id" => note["id"],
      "url" => extract_note_url(note),
      "parent_comment_id" => parent_comment.id,
      "entry_id" => parent_comment.entry_id,
      "remote_entry_id" => parent_comment.remote_entry_id,
      "remote_author" => build_remote_author_data(remote_actor, profile_url)
    }

    case Journals.create_comment(comment_attrs) do
      {:ok, comment} ->
        Logger.info("Created federated reply-to-comment #{comment.id} parent=#{parent_comment.id} from #{remote_actor.ap_id}")
        maybe_notify_parent_comment_author(parent_comment, remote_actor, profile_url)

      {:error, reason} ->
        Logger.warning("Failed to create federated reply-to-comment: #{inspect(reason)}")
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

  # Extract the human-readable URL from an AP Note. Per AS spec, `url` is
  # distinct from `id` — `id` is the canonical AP identifier, `url` is the
  # browser-viewable page (e.g., https://mastodon.social/@user/12345).
  # Mastodon sends a string; some implementations may omit it. Fall back to
  # the AP id, which is also browser-resolvable on Mastodon.
  defp extract_note_url(%{"url" => url}) when is_binary(url), do: url
  defp extract_note_url(%{"id" => id}) when is_binary(id), do: id
  defp extract_note_url(_), do: nil

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
            |> Inkwell.Federation.AttachmentHelper.append_media_attachments(note)

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
      # A letter its author deleted (only ever by that author).
      Inkwell.Letters.Federation.receive_delete(object_id, activity["actor"])

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

      # An account deleting itself: drop the actor and everything cached with it.
      if object_id == activity["actor"], do: purge_gone_actor(object_id)
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

  @entities %{
    "&amp;" => "&", "&lt;" => "<", "&gt;" => ">", "&quot;" => "\"",
    "&#39;" => "'", "&#x27;" => "'", "&apos;" => "'", "&nbsp;" => " ",
    "&hellip;" => "…", "&mdash;" => "—", "&ndash;" => "–"
  }

  @doc false
  def decode_html_entities(text) when is_binary(text) do
    text
    |> then(fn t -> Enum.reduce(@entities, t, fn {e, c}, acc -> String.replace(acc, e, c) end) end)
    |> then(fn t ->
      # Any remaining numeric entities (&#8217; / &#x2019;)
      Regex.replace(~r/&#(x[0-9a-fA-F]+|\d+);/, t, fn _, code ->
        case Integer.parse(String.trim_leading(code, "x"), if(String.starts_with?(code, "x"), do: 16, else: 10)) do
          {n, _} when n > 0 and n <= 0x10FFFF -> <<n::utf8>>
          _ -> ""
        end
      end)
    end)
  end

  def decode_html_entities(other), do: other

  # Create a fediverse_mention notification for a specific user
  defp create_mention_notification_for_user(object, actor_uri, user) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        if blocked_for_user?(user.id, remote_actor) do
          Logger.info("Dropping mention of @#{user.username} from #{actor_uri}: blocked")
        else
          do_create_mention_notification(object, user, remote_actor)
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch actor for mention notification: #{inspect(reason)}")
    end
  end

  defp do_create_mention_notification(object, user, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    raw_content = object["content"] || ""

    # Plain-text preview. HTML entities have to be decoded after stripping
    # tags, or the notification shows "haven&#39;t" instead of "haven't".
    content_preview =
      raw_content
      |> String.replace(~r/<[^>]+>/, " ")
      |> decode_html_entities()
      |> String.replace(~r/\s+/, " ")
      |> String.trim()
      |> String.slice(0, 500)

    post_url =
      case object do
        %{"url" => url} when is_binary(url) -> url
        %{"id" => id} when is_binary(id) -> id
        _ -> nil
      end

    # Direct and followers-only posts 404 for anyone who isn't signed in
    # on the remote server, so only link out when the post is public.
    public? =
      [object["to"], object["cc"]]
      |> List.flatten()
      |> Enum.filter(&is_binary/1)
      |> Enum.any?(&(&1 == "https://www.w3.org/ns/activitystreams#Public"))

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
        content_html: Inkwell.HtmlSanitizer.sanitize(raw_content) |> String.slice(0, 5000),
        post_url: post_url,
        public: public?
      }
    })
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
        if blocked_for_user?(profile_user.id, remote_actor) do
          Logger.info("Dropping guestbook reply from #{actor_uri}: blocked by @#{profile_user.username}")
        else
          create_federated_guestbook_entry(note, profile_user, remote_actor)
        end

      {:error, reason} ->
        Logger.warning("Failed to fetch actor for guestbook reply: #{inspect(reason)}")
    end
  end

  defp create_federated_guestbook_entry(note, profile_user, remote_actor) do
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
