defmodule InkwellWeb.CommentController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Social}
  alias Inkwell.Repo
  alias Inkwell.Journals.Comment
  alias Inkwell.Federation.{ActivityBuilder, Workers.DeliverActivityWorker}
  alias InkwellWeb.Helpers.MentionHelper

  require Logger

  # GET /api/users/:username/entries/:slug/comments
  def index(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         entry when not is_nil(entry) <- Journals.get_entry_by_slug(user.id, slug) do

      viewer = conn.assigns[:current_user]
      accessible? =
        entry.privacy == :public ||
        (viewer && viewer.id == user.id) ||
        (viewer && Social.is_friend?(viewer.id, user.id))

      if accessible? do
        comments = Journals.list_comments(entry.id)
        # Post-filter comments from blocked users
        blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []
        comments = if blocked_ids != [], do: Enum.reject(comments, fn c -> c.user_id in blocked_ids end), else: comments
        json(conn, %{data: Enum.map(comments, &render_comment/1)})
      else
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # GET /api/entries/:entry_id/comments — fetch comments by entry ID
  def index_by_entry(conn, %{"entry_id" => entry_id} = params) do
    limit = parse_int(params["limit"], 50)

    try do
      entry = Journals.get_entry!(entry_id)

      viewer = conn.assigns[:current_user]
      accessible? =
        entry.privacy == :public ||
        (viewer && viewer.id == entry.user_id) ||
        (viewer && Social.is_friend?(viewer.id, entry.user_id))

      if accessible? do
        comments = Journals.list_comments(entry.id)
        # Post-filter comments from blocked users
        blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []
        comments = if blocked_ids != [], do: Enum.reject(comments, fn c -> c.user_id in blocked_ids end), else: comments
        # Apply limit (most recent N)
        limited = Enum.take(comments, -limit) |> Enum.reverse() |> Enum.reverse()
        json(conn, %{data: Enum.map(limited, &render_comment/1)})
      else
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # POST /api/entries/:entry_id/comments
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    try do
      entry = Journals.get_entry!(entry_id)

      # Check if blocked
      cond do
        Social.is_blocked_between?(user.id, entry.user_id) ->
          conn |> put_status(:forbidden) |> json(%{error: "Cannot comment on this entry"})

        not (entry.privacy == :public || entry.user_id == user.id || Social.is_friend?(user.id, entry.user_id)) ->
          conn |> put_status(:forbidden) |> json(%{error: "Cannot comment on this entry"})

        true ->
          attrs = %{
            "entry_id" => entry_id,
            "user_id" => user.id,
            "body_html" => params["body_html"],
            "parent_comment_id" => params["parent_comment_id"],
            "user_icon_id" => params["user_icon_id"],
            "ap_id" => "https://inkwell.social/comments/#{:erlang.unique_integer([:positive])}"
          }

          # Convert @mentions to profile links in body_html
          body_html = params["body_html"] || ""
          {processed_html, mentioned_users} = MentionHelper.process_mentions(body_html)
          attrs = Map.put(attrs, "body_html", processed_html)

          case Journals.create_comment(attrs) do
            {:ok, comment} ->
              # Notify entry author (unless commenter is the author)
              if entry.user_id != user.id do
                Accounts.create_notification(%{
                  user_id: entry.user_id,
                  type: :comment,
                  actor_id: user.id,
                  target_type: "entry",
                  target_id: entry_id,
                  data: %{comment_id: comment.id}
                })
              end

              # Notify parent comment author when replying
              parent_comment =
                if comment.parent_comment_id,
                  do: Repo.get(Journals.Comment, comment.parent_comment_id),
                  else: nil

              if parent_comment && parent_comment.user_id &&
                 parent_comment.user_id != user.id &&
                 parent_comment.user_id != entry.user_id do
                Accounts.create_notification(%{
                  user_id: parent_comment.user_id,
                  type: :reply,
                  actor_id: user.id,
                  target_type: "entry",
                  target_id: entry_id,
                  data: %{comment_id: comment.id, parent_comment_id: comment.parent_comment_id}
                })
              end

              # Notify mentioned users (skip self, entry author, and parent comment author)
              skip_ids = MapSet.new(
                [user.id, entry.user_id, parent_comment && parent_comment.user_id]
                |> Enum.reject(&is_nil/1)
              )
              for mentioned <- mentioned_users, mentioned.id not in skip_ids do
                Accounts.create_notification(%{
                  user_id: mentioned.id,
                  type: :mention,
                  actor_id: user.id,
                  target_type: "entry",
                  target_id: entry_id,
                  data: %{comment_id: comment.id}
                })
              end

              # Fan out comment to fediverse followers of the entry author
              maybe_federate_comment(entry, comment, user)

              conn |> put_status(:created) |> json(%{data: render_comment(comment)})

            {:error, changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{errors: format_errors(changeset)})
          end
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # PATCH /api/comments/:id
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    try do
      comment = Repo.get!(Comment, id) |> Repo.preload([:user])

      cond do
        comment.user_id != user.id ->
          conn |> put_status(:forbidden) |> json(%{error: "Not your comment"})

        true ->
          # Process @mentions in edited body
          {processed_html, _mentioned_users} = MentionHelper.process_mentions(params["body_html"] || "")
          case Journals.update_comment(comment, %{"body_html" => processed_html}) do
            {:ok, comment} ->
              json(conn, %{data: render_comment(comment)})

            {:error, :edit_window_expired} ->
              conn |> put_status(422) |> json(%{error: "Comments can only be edited within 24 hours of posting."})

            {:error, changeset} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
          end
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Comment not found"})
    end
  end

  # DELETE /api/comments/:id
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    try do
      comment = Repo.get!(Comment, id)
      can_delete = comment.user_id == user.id || Accounts.is_admin?(user)

      if can_delete do
        {:ok, _} = Journals.delete_comment(comment)
        send_resp(conn, :no_content, "")
      else
        conn |> put_status(:forbidden) |> json(%{error: "Not your comment"})
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Comment not found"})
    end
  end

  defp render_comment(comment) do
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: comment.user.avatar_url,
          avatar_frame: comment.user.avatar_frame,
          avatar_animation: comment.user.avatar_animation,
          subscription_tier: comment.user.subscription_tier
        }
      end

    # Include remote_author for federated comments (from Mastodon/Pleroma/etc)
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
      entry_id: comment.entry_id,
      user_id: comment.user_id,
      parent_comment_id: comment.parent_comment_id,
      body_html: comment.body_html,
      user_icon_id: comment.user_icon_id,
      ap_id: comment.ap_id,
      depth: comment.depth,
      author: author,
      remote_author: remote_author,
      created_at: comment.inserted_at,
      edited_at: comment.edited_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
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

  # ── Federation: fan out local comments to fediverse ──────────────────────

  # When a user comments on a public local entry, deliver the comment as a
  # Create{Note} with inReplyTo to all fediverse followers of the entry author.
  # This makes Inkwell comments appear in Mastodon threads.
  defp maybe_federate_comment(entry, comment, user) do
    # Only federate comments on public entries (fediverse can't see private content)
    if entry.privacy == :public do
      Task.start(fn ->
        try do
          entry_author = Accounts.get_user!(entry.user_id)
          inboxes = Inkwell.Federation.Workers.FanOutWorker.collect_remote_inboxes(entry_author.id)

          if inboxes != [] do
            # Build the reply Note addressed to the entry author.
            # build_reply_note creates a proper Mention tag and addresses
            # the Note to the entry author — this is essential for Mastodon
            # to thread the comment under the original entry.
            entry_author_ap_id = ActivityBuilder.actor_url(entry_author)

            activity = ActivityBuilder.build_reply_note(
              comment.body_html,
              entry.ap_id,
              user,
              comment.id,
              entry_author_ap_id
            )

            # Adjust addressing: the comment should be public (so fediverse
            # followers can see the thread) with the entry author mentioned.
            # build_reply_note sets to=[author], cc=[Public, commenter_followers]
            # We add the entry author's followers to cc so the thread propagates.
            commenter_url = activity["actor"]
            commenter_followers = "#{commenter_url}/followers"
            author_followers = "#{entry_author_ap_id}/followers"
            public = "https://www.w3.org/ns/activitystreams#Public"

            activity =
              activity
              |> Map.put("to", [public, entry_author_ap_id])
              |> Map.put("cc", [commenter_followers, author_followers])
              |> Map.update("object", %{}, fn obj ->
                obj
                |> Map.put("to", [public, entry_author_ap_id])
                |> Map.put("cc", [commenter_followers, author_followers])
                # Keep the Mention tag from build_reply_note — Mastodon needs it
              end)

            Logger.info("Federating comment #{comment.id} on entry #{entry.id} by #{user.username} to #{length(inboxes)} inboxes (entry author: #{entry_author.username})")

            Enum.each(inboxes, fn inbox_url ->
              %{activity: activity, inbox_url: inbox_url, user_id: user.id}
              |> DeliverActivityWorker.new()
              |> Oban.insert()
            end)
          end
        rescue
          e ->
            Logger.warning("Failed to federate comment #{comment.id}: #{inspect(e)}")
        end
      end)
    end
  end

end
