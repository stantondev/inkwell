defmodule InkwellWeb.RemoteEntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Inks, Journals, Social, Stamps}
  alias Inkwell.Federation.{ActivityBuilder, CommentFederation, Engagement, RemoteEntries, ReplyFetcher}
  alias Inkwell.Journals.Comment
  alias InkwellWeb.Helpers.MentionHelper
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FetchRepliesWorker}
  alias Inkwell.Repo
  alias InkwellWeb.StampController

  import Ecto.Query

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
          stamp_fields =
            Map.merge(
              Stamps.remote_entry_fields(remote_entry.id),
              StampController.my_fields(viewer && Stamps.get_user_remote_stamp(viewer.id, remote_entry.id))
            )

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
            data: Map.merge(stamp_fields, %{
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
              comment_count: counts.comment_count,
              ink_count: counts.ink_count,
              reprint_count: counts.reprint_count,
              boosts_count: counts.boosts_count,
              my_ink: counts.my_ink,
              my_reprint: counts.my_reprint,
              sensitive: remote_entry.sensitive || false,
              content_warning: remote_entry.content_warning,
              is_sensitive: remote_entry.sensitive || false
            })
          })
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # GET /api/remote-entries/:id/stamps
  def stamps(conn, %{"id" => id}) do
    viewer = conn.assigns[:current_user]

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        mine = viewer && Stamps.get_user_remote_stamp(viewer.id, remote_entry.id)

        json(conn, %{
          data: Map.merge(Stamps.remote_entry_fields(remote_entry.id), StampController.my_fields(mine))
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # POST /api/remote-entries/:id/stamp  {stamp_type, note?}
  # The stamp goes to the post's author as a Like carrying our stamp as a
  # custom emoji: Misskey and Akkoma show the stamp itself, Mastodon a favourite.
  def stamp(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    stamp_type = params["stamp_type"]

    with :ok <- StampController.validate_stamp_type(stamp_type),
         :ok <- StampController.validate_plus_sheet(stamp_type, user),
         {:ok, remote_entry} <- get_remote_entry(id) do
      case Stamps.stamp_remote_entry(user.id, remote_entry.id, StampController.stamp_attrs(stamp_type, params)) do
        {:ok, stamp, action, previous} ->
          remote_entry = Repo.preload(remote_entry, :remote_actor)
          new_type = Atom.to_string(stamp.stamp_type)

          cond do
            action == :created ->
              deliver_like(remote_entry, user, new_type)

            previous && Atom.to_string(previous) != new_type ->
              # A new design is a new reaction: take the old one back first.
              deliver_undo_like(remote_entry, user, Atom.to_string(previous))
              deliver_like(remote_entry, user, new_type)

            true ->
              # Only the note changed; notes stay on Inkwell.
              :ok
          end

          Engagement.refresh_soon(remote_entry.id)

          json(conn, %{
            data:
              Map.merge(Stamps.remote_entry_fields(remote_entry.id), %{
                stamp_type: new_type,
                note: stamp.note
              })
              |> Map.merge(StampController.my_fields(stamp))
          })

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: StampController.first_error(changeset), errors: format_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})

      error ->
        StampController.render_error(conn, error)
    end
  end

  # DELETE /api/remote-entries/:id/stamp
  def unstamp(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        case Stamps.remove_remote_stamp(user.id, remote_entry.id) do
          {:ok, stamp} ->
            remote_entry = Repo.preload(remote_entry, :remote_actor)
            deliver_undo_like(remote_entry, user, Atom.to_string(stamp.stamp_type))
            Engagement.refresh_soon(remote_entry.id)

            json(conn, %{
              data: Map.merge(Stamps.remote_entry_fields(remote_entry.id), StampController.my_fields(nil))
            })

          {:error, :not_found} ->
            conn |> put_status(:not_found) |> json(%{error: "No stamp to take back"})
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
          |> Inkwell.Federation.RemoteAuthors.with_current_avatars()

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

    with {:ok, _remote_entry} <- get_remote_entry(id),
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

          # A reply to the post's author (and to the fediverse commenter answered).
          CommentFederation.deliver(comment, :create, replied_to: parent)

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

  defp deliver_like(remote_entry, user, stamp_type) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_like(remote_entry.ap_id, user, actor.ap_id, stamp_type)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  defp deliver_undo_like(remote_entry, user, stamp_type) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_undo_like(remote_entry.ap_id, user, actor.ap_id, stamp_type)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────────

  defp get_remote_entry(id) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         %{} = entry <- RemoteEntries.get_remote_entry(uuid) do
      {:ok, entry}
    else
      _ -> {:error, :not_found}
    end
  end

  defp render_comment(comment) do
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: Inkwell.Avatars.avatar_url(comment.user)
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
