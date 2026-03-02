defmodule InkwellWeb.FederationController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals}
  alias Inkwell.Federation.{ActivityBuilder, HttpSignature, RemoteActor, RemoteEntries}
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FetchOutboxWorker}
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
  def nodeinfo(conn, _params) do
    instance_host = federation_config(:instance_host)

    conn
    |> put_resp_content_type("application/json")
    |> json(%{
      links: [
        %{
          rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
          href: "https://#{instance_host}/nodeinfo/2.1"
        }
      ]
    })
  end

  # GET /nodeinfo/2.1
  def nodeinfo_schema(conn, _params) do
    user_count = Repo.aggregate(Inkwell.Accounts.User, :count)
    post_count = Repo.aggregate(Inkwell.Journals.Entry, :count)

    conn
    |> put_resp_content_type("application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.1\"")
    |> json(%{
      version: "2.1",
      software: %{
        name: "inkwell",
        version: "0.1.0"
      },
      protocols: ["activitypub"],
      usage: %{
        users: %{total: user_count},
        localPosts: post_count
      },
      openRegistrations: true
    })
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
          total = Journals.count_entries(user.id)

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

  # POST /users/:username/inbox
  def inbox(conn, %{"username" => username} = params) do
    case verify_inbox_signature(conn) do
      :ok ->
        case Accounts.get_user_by_username(username) do
          nil ->
            conn |> put_status(:not_found) |> json(%{error: "Not found"})

          user ->
            process_activity(conn, params, user)
        end

      {:error, _reason} ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
    end
  end

  # POST /inbox  (shared inbox)
  def shared_inbox(conn, params) do
    case verify_inbox_signature(conn) do
      :ok ->
        process_activity(conn, params, nil)

      {:error, _reason} ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
    end
  end

  # ── Activity processing ─────────────────────────────────────────────────

  defp process_activity(conn, activity, target_user) do
    activity_type = activity["type"]
    Logger.info("Inbox received #{activity_type} activity from #{activity["actor"]}")

    case activity_type do
      "Follow" ->
        handle_follow(conn, activity, target_user)

      "Undo" ->
        handle_undo(conn, activity, target_user)

      "Create" ->
        handle_create(conn, activity, target_user)

      "Accept" ->
        handle_accept(conn, activity, target_user)

      "Like" ->
        handle_like(conn, activity, target_user)

      "Update" ->
        handle_update(conn, activity, target_user)

      "Delete" ->
        handle_delete(conn, activity, target_user)

      "Announce" ->
        # Boost — acknowledge for now
        conn |> put_status(:accepted) |> json(%{ok: true})

      _ ->
        Logger.info("Ignoring unsupported activity type: #{activity_type}")
        conn |> put_status(:accepted) |> json(%{ok: true})
    end
  end

  # ── Signature verification ──────────────────────────────────────────────

  # Verifies the HTTP Signature on inbound ActivityPub requests.
  # Returns :ok on success, {:error, reason} on failure (hard reject).
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
        # Derive actor URI by stripping the key fragment (e.g. #main-key)
        actor_uri = Regex.replace(~r/#.*$/, key_id, "")

        case RemoteActor.fetch(actor_uri) do
          {:ok, actor} ->
            case HttpSignature.verify_signature(conn, sig_parts, actor.public_key_pem) do
              :ok ->
                Logger.debug("Inbox: signature verified for #{actor_uri}")
                :ok

              {:error, reason} ->
                Logger.warning("Inbox: REJECTED — signature FAILED for #{actor_uri} — #{inspect(reason)}")
                {:error, reason}
            end

          {:error, reason} ->
            Logger.warning("Inbox: REJECTED — could not fetch actor #{actor_uri} — #{inspect(reason)}")
            {:error, reason}
        end
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

  defp handle_follow(conn, activity, target_user) do
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

      conn |> put_status(:accepted) |> json(%{ok: true})
    else
      _ ->
        Logger.warning("Follow handling failed for #{actor_uri}")
        conn |> put_status(:accepted) |> json(%{ok: true})
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

  defp handle_undo(conn, activity, target_user) do
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

      _ ->
        :ok
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # ── Accept handling (outbound follow accepted) ──────────────────────────

  defp handle_accept(conn, activity, _target_user) do
    case activity["object"] do
      %{"type" => "Follow", "actor" => local_actor_url} when is_binary(local_actor_url) ->
        # This is a remote server accepting our follow request
        remote_actor_uri = activity["actor"]

        # Extract our local username from the actor URL
        case Regex.run(~r|/users/([^/]+)$|, local_actor_url) do
          [_, username] ->
            case {Accounts.get_user_by_username(username), RemoteActor.get_by_ap_id(remote_actor_uri)} do
              {%{id: user_id}, %{id: remote_actor_id}} ->
                # Update the relationship from pending to accepted
                Inkwell.Social.Relationship
                |> where([r], r.follower_id == ^user_id and r.remote_actor_id == ^remote_actor_id)
                |> Repo.update_all(set: [status: :accepted, updated_at: DateTime.utc_now()])

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

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # ── Create handling (inbound Notes) ─────────────────────────────────────

  defp handle_create(conn, activity, _target_user) do
    case activity["object"] do
      %{"type" => type, "inReplyTo" => in_reply_to}
          when type in ["Note", "Article", "Page"] and is_binary(in_reply_to) ->
        # Reply to a local entry (Note, Article, or Page)
        handle_incoming_reply(activity["object"], activity["actor"])

      %{"type" => type} = object when type in ["Note", "Article", "Page"] ->
        # Standalone public post — store as remote entry
        handle_incoming_note(object, activity["actor"])

      _ ->
        :ok
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # ── Update handling (inbound edits) ────────────────────────────────────

  defp handle_update(conn, activity, _target_user) do
    case activity["object"] do
      %{"type" => type} = object when type in ["Note", "Article", "Page"] ->
        # Re-use ingestion path; upsert will update existing
        handle_incoming_note(object, activity["actor"])

      _ ->
        :ok
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  defp handle_incoming_reply(note, actor_uri) do
    in_reply_to = note["inReplyTo"]

    case find_entry_by_ap_url(in_reply_to) do
      nil ->
        Logger.info("Ignoring reply to unknown entry: #{in_reply_to}")

      entry ->
        case RemoteActor.fetch(actor_uri) do
          {:ok, remote_actor} ->
            profile_url =
              case remote_actor.raw_data do
                %{"url" => url} when is_binary(url) -> url
                _ -> remote_actor.ap_id
              end

            comment_attrs = %{
              entry_id: entry.id,
              body_html: note["content"] || "",
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

            case Journals.create_comment(comment_attrs) do
              {:ok, _comment} ->
                create_reply_notification(entry, remote_actor)
                Logger.info("Created federated comment on entry #{entry.id} from #{actor_uri}")

              {:error, reason} ->
                Logger.warning("Failed to create federated comment: #{inspect(reason)}")
            end

          {:error, reason} ->
            Logger.warning("Failed to fetch remote actor #{actor_uri}: #{inspect(reason)}")
        end
    end
  end

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

          attrs = %{
            ap_id: note["id"],
            url: url,
            title: note["name"],
            body_html: note["content"] || "",
            tags: tags,
            published_at: parse_ap_datetime(note["published"]),
            remote_actor_id: remote_actor.id,
            sensitive: is_sensitive,
            content_warning: content_warning
          }

          case RemoteEntries.upsert_remote_entry(attrs) do
            {:ok, _} ->
              Logger.info("Stored remote entry #{note["id"]} from #{actor_uri}")

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
      (t["name"] || "") |> String.trim_leading("#")
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

  defp handle_like(conn, activity, _target_user) do
    object_uri = activity["object"]
    actor_uri = activity["actor"]

    if is_binary(object_uri) do
      case find_entry_by_ap_url(object_uri) do
        nil ->
          :ok

        entry ->
          case RemoteActor.fetch(actor_uri) do
            {:ok, remote_actor} ->
              create_like_notification(entry, remote_actor)
              Logger.info("Received like on entry #{entry.id} from #{actor_uri}")

            _ ->
              :ok
          end
      end
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # ── Delete handling ─────────────────────────────────────────────────────

  defp handle_delete(conn, activity, _target_user) do
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
    end

    conn |> put_status(:accepted) |> json(%{ok: true})
  end

  # ── Notification helpers ────────────────────────────────────────────────

  defp create_reply_notification(entry, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    %Inkwell.Accounts.Notification{}
    |> Inkwell.Accounts.Notification.changeset(%{
      user_id: entry.user_id,
      type: :comment,
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
    |> Repo.insert()
  end

  defp create_like_notification(entry, remote_actor) do
    profile_url =
      case remote_actor.raw_data do
        %{"url" => url} when is_binary(url) -> url
        _ -> remote_actor.ap_id
      end

    %Inkwell.Accounts.Notification{}
    |> Inkwell.Accounts.Notification.changeset(%{
      user_id: entry.user_id,
      type: :like,
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
    |> Repo.insert()
  end

  # ── Entry lookup helper ──────────────────────────────────────────────────

  # Find an entry by AP URL, handling both legacy (inkwell.social) and current
  # (inkwell-api.fly.dev) domains. Also handles the /entries/{uuid} path pattern.
  defp find_entry_by_ap_url(url) when is_binary(url) do
    # First: try direct ap_id match (legacy domain)
    case Repo.get_by(Inkwell.Journals.Entry, ap_id: url) do
      nil ->
        # Try extracting the entry UUID from the URL path
        # Pattern: https://host/entries/{uuid}
        case Regex.run(~r|/entries/([0-9a-f-]{36})|, url) do
          [_, id] -> Repo.get(Inkwell.Journals.Entry, id)
          _ -> nil
        end

      entry ->
        entry
    end
  end

  defp find_entry_by_ap_url(_), do: nil

  # ── Config helper ───────────────────────────────────────────────────────

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key, default_config(key))
  end

  defp default_config(:instance_host), do: "inkwell-api.fly.dev"
  defp default_config(:frontend_host), do: "https://inkwell.social"
  defp default_config(_), do: nil
end
