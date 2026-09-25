defmodule InkwellWeb.RemoteEntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Inks, Journals, Social, Stamps}
  alias Inkwell.Federation.{ActivityBuilder, Engagement, RemoteActor, RemoteEntries, ReplyFetcher}
  alias Inkwell.Journals.Comment
  alias InkwellWeb.Helpers.MentionHelper
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FetchRepliesWorker}
  alias Inkwell.Repo

  import Ecto.Query

  @valid_stamp_types ~w(felt holding_space beautifully_said rooting throwback i_cannot first_class)

  # GET /api/remote-entries/:id — detail view for a single fediverse entry
  def show(conn, %{"id" => id}) do
    viewer = conn.assigns[:current_user]

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        remote_entry = Repo.preload(remote_entry, :remote_actor)
        actor = remote_entry.remote_actor

        unless actor do
          conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
        end

        # Block check
        blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []
        if actor && actor.id in blocked_ids do
          conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
        else
          # Fetch engagement data
          entry_ids = [id]
          stamp_types_map = Stamps.get_stamp_types_for_remote_entries(entry_ids)
          my_stamps_map = if viewer, do: Stamps.get_user_stamps_for_remote_entries(viewer.id, entry_ids), else: %{}
          counts = Engagement.summary(remote_entry, viewer && viewer.id)
          Engagement.refresh_stale([remote_entry])

          # Enqueue link preview enrichment if entry has links but no preview yet
          enriching_preview =
            if not String.contains?(remote_entry.body_html || "", "data-link-embed") and
               String.contains?(remote_entry.body_html || "", "<a ") do
              %{remote_entry_id: remote_entry.id}
              |> Inkwell.Workers.LinkPreviewWorker.new()
              |> Oban.insert()
              true
            else
              false
            end

          json(conn, %{
            enriching_preview: enriching_preview,
            data: %{
              id: remote_entry.id,
              source: "remote",
              relay_source: remote_entry.source,
              ap_id: remote_entry.ap_id,
              url: remote_entry.url,
              title: remote_entry.title,
              body_html: remote_entry.body_html,
              tags: remote_entry.tags || [],
              published_at: remote_entry.published_at,
              author: %{
                username: actor.username,
                display_name: actor.display_name || actor.username,
                avatar_url: actor.avatar_url,
                domain: actor.domain,
                ap_id: actor.ap_id,
                profile_url: get_profile_url(actor)
              },
              stamps: Map.get(stamp_types_map, id, []),
              my_stamp: Map.get(my_stamps_map, id),
              comment_count: counts.comment_count,
              ink_count: counts.ink_count,
              reprint_count: counts.reprint_count,
              boosts_count: counts.boosts_count,
              my_ink: counts.my_ink,
              my_reprint: counts.my_reprint,
              sensitive: remote_entry.sensitive || false,
              content_warning: remote_entry.content_warning,
              is_sensitive: remote_entry.sensitive || false
            }
          })
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # POST /api/remote-entries/:id/stamp
  def stamp(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    stamp_type = params["stamp_type"]

    with :ok <- validate_stamp_type(stamp_type),
         :ok <- validate_plus_for_first_class(stamp_type, user),
         {:ok, remote_entry} <- get_remote_entry(id) do
      case Stamps.stamp_remote_entry(user.id, id, stamp_type) do
        {:ok, stamp, _action} ->
          # Send Like activity to the remote actor's inbox
          remote_entry = Repo.preload(remote_entry, :remote_actor)
          deliver_like(remote_entry, user)
          Engagement.refresh_soon(id)

          json(conn, %{data: %{
            stamp_type: Atom.to_string(stamp.stamp_type),
            stamps: Stamps.get_stamp_types_for_remote_entries([id]) |> Map.get(id, [])
          }})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: format_errors(changeset)})
      end
    else
      {:error, :invalid_stamp_type} ->
        conn |> put_status(:bad_request) |> json(%{error: "Invalid stamp type"})

      {:error, :plus_required} ->
        conn |> put_status(:forbidden) |> json(%{error: "Plus subscription required for this stamp"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # DELETE /api/remote-entries/:id/stamp
  def unstamp(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        case Stamps.remove_remote_stamp(user.id, id) do
          {:ok, _} ->
            # Send Undo { Like } to remote inbox
            remote_entry = Repo.preload(remote_entry, :remote_actor)
            deliver_undo_like(remote_entry, user)
            Engagement.refresh_soon(id)

            stamps = Stamps.get_stamp_types_for_remote_entries([id]) |> Map.get(id, [])
            json(conn, %{data: %{stamps: stamps, my_stamp: nil}})

          {:error, :not_found} ->
            conn |> put_status(:not_found) |> json(%{error: "No stamp to remove"})
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # GET /api/remote-entries/:id/comments
  def list_comments(conn, %{"id" => id}) do
    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        # Check if we should trigger a background fetch of fediverse replies.
        # `fetching` only when a job was queued: a fetch that ran in the last
        # 5 minutes blocks a new one (FetchRepliesWorker is unique), and the
        # page would otherwise wait for replies that aren't coming.
        fetching =
          ReplyFetcher.needs_fetch?(remote_entry) and
            match?(
              {:ok, %Oban.Job{conflict?: false}},
              %{remote_entry_id: id} |> FetchRepliesWorker.new() |> Oban.insert()
            )

        comments =
          Inkwell.Journals.Comment
          |> where([c], c.remote_entry_id == ^id)
          |> order_by(asc: :inserted_at)
          |> preload(:user)
          |> Repo.all()

        json(conn, %{
          data: Enum.map(comments, &render_comment/1),
          comment_count: Engagement.summary(remote_entry).comment_count,
          replies_fetched_at: remote_entry.replies_fetched_at,
          fetching: fetching
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # POST /api/remote-entries/:id/comments
  def create_comment(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, remote_entry} <- get_remote_entry(id),
         {:ok, parent} <- reply_parent(params["parent_comment_id"], id) do
      comment_id = Ecto.UUID.generate()
      {body_html, mentioned_users} = MentionHelper.process_mentions(params["body_html"] || "")

      attrs = %{
        "id" => comment_id,
        "remote_entry_id" => id,
        "user_id" => user.id,
        "body_html" => body_html,
        "parent_comment_id" => parent && parent.id,
        "ap_id" => ActivityBuilder.comment_ap_url(%{id: comment_id})
      }

      case Journals.create_comment(attrs) do
        {:ok, comment} ->
          notify_comment(comment, parent, mentioned_users, user, id)

          remote_entry = Repo.preload(remote_entry, :remote_actor)
          deliver_reply(remote_entry, comment, user, parent)

          conn |> put_status(:created) |> json(%{data: render_comment(comment)})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{errors: format_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})

      {:error, :bad_parent} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "That comment isn't on this post"})
    end
  end

  # The comment being replied to must belong to the same fediverse post.
  defp reply_parent(nil, _remote_entry_id), do: {:ok, nil}
  defp reply_parent("", _remote_entry_id), do: {:ok, nil}

  defp reply_parent(parent_id, remote_entry_id) do
    with {:ok, _} <- Ecto.UUID.cast(parent_id),
         %Comment{remote_entry_id: ^remote_entry_id} = parent <- Repo.get(Comment, parent_id) do
      {:ok, parent}
    else
      _ -> {:error, :bad_parent}
    end
  end

  # Replies and @mentions on a fediverse post notify the Inkwell members
  # involved, the same way they do on Inkwell entries. There is no Inkwell
  # author to notify about a plain comment: the post belongs to someone on
  # another server, who hears about it through the federated reply.
  defp notify_comment(comment, parent, mentioned_users, user, remote_entry_id) do
    parent_author_id = parent && parent.user_id

    if parent_author_id && parent_author_id != user.id do
      Accounts.create_notification(%{
        user_id: parent_author_id,
        type: :reply,
        actor_id: user.id,
        target_type: "remote_entry",
        target_id: remote_entry_id,
        data: %{comment_id: comment.id, parent_comment_id: parent.id}
      })
    end

    skip = MapSet.new(Enum.reject([user.id, parent_author_id], &is_nil/1))

    for mentioned <- mentioned_users, not MapSet.member?(skip, mentioned.id) do
      Accounts.create_notification(%{
        user_id: mentioned.id,
        type: :mention,
        actor_id: user.id,
        target_type: "remote_entry",
        target_id: remote_entry_id,
        data: %{comment_id: comment.id}
      })
    end
  end

  # POST /api/remote-entries/:id/ink
  def toggle_ink(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        # The count sent back includes the post's fediverse favourites, like the
        # one the button started with (it used to drop them on every tap).
        case Inks.toggle_ink_remote(user.id, id) do
          {:ok, {:created, _ink}} ->
            json(conn, %{data: %{inked: true, ink_count: Engagement.summary(remote_entry).ink_count}})

          {:ok, {:removed, _}} ->
            json(conn, %{data: %{inked: false, ink_count: Engagement.summary(remote_entry).ink_count}})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: format_errors(changeset)})
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # ── Activity delivery helpers ──────────────────────────────────────────

  defp deliver_like(remote_entry, user) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_like(remote_entry.ap_id, user, actor.ap_id)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  defp deliver_undo_like(remote_entry, user) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_undo_like(remote_entry.ap_id, user, actor.ap_id)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  # Sends the reply to the post author's server and, when it answers a
  # fediverse comment, to that commenter's server too, so both threads update.
  defp deliver_reply(remote_entry, comment, user, parent) do
    actor = remote_entry.remote_actor

    if actor do
      activity =
        comment.body_html
        |> ActivityBuilder.build_reply_note(remote_entry.ap_id, user, comment.id, actor.ap_id)
        |> ActivityBuilder.thread_reply(parent)

      Inkwell.Federation.Background.run(fn ->
        inboxes =
          [actor.shared_inbox || actor.inbox | parent_author_inboxes(parent, actor.ap_id)]
          |> Enum.reject(&is_nil/1)
          |> Enum.uniq()

        for inbox <- inboxes do
          %{activity: activity, inbox_url: inbox, user_id: user.id}
          |> DeliverActivityWorker.new()
          |> Oban.insert()
        end
      end)
    end
  end

  defp parent_author_inboxes(parent, post_author_ap_id) do
    case ActivityBuilder.remote_comment_author(parent) do
      nil -> []
      ^post_author_ap_id -> []
      ap_id -> [RemoteActor.inbox_for(ap_id)]
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────────

  defp get_remote_entry(id) do
    case RemoteEntries.get_remote_entry(id) do
      nil -> {:error, :not_found}
      entry -> {:ok, entry}
    end
  end

  defp validate_stamp_type(stamp_type) when stamp_type in @valid_stamp_types, do: :ok
  defp validate_stamp_type(_), do: {:error, :invalid_stamp_type}

  defp validate_plus_for_first_class("first_class", user) do
    if user.subscription_tier == "plus", do: :ok, else: {:error, :plus_required}
  end
  defp validate_plus_for_first_class(_, _), do: :ok

  defp render_comment(comment) do
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: comment.user.avatar_url
        }
      end

    remote_author =
      case comment.remote_author do
        %{} = ra when map_size(ra) > 0 ->
          %{
            username: ra["username"] || ra[:username],
            domain: ra["domain"] || ra[:domain],
            display_name: ra["display_name"] || ra[:display_name],
            avatar_url: ra["avatar_url"] || ra[:avatar_url],
            profile_url: ra["profile_url"] || ra[:profile_url],
            ap_id: ra["ap_id"] || ra[:ap_id]
          }
        _ -> nil
      end

    %{
      id: comment.id,
      remote_entry_id: comment.remote_entry_id,
      user_id: comment.user_id,
      parent_comment_id: comment.parent_comment_id,
      body_html: comment.body_html,
      ap_id: comment.ap_id,
      url: comment.url,
      depth: comment.depth || 0,
      author: author,
      remote_author: remote_author,
      created_at: comment.inserted_at
    }
  end

  defp get_profile_url(actor) do
    case actor.raw_data do
      %{"url" => url} when is_binary(url) -> url
      _ -> actor.ap_id
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
