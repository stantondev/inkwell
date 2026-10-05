defmodule InkwellWeb.CommentController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Social}
  alias Inkwell.Avatars
  alias Inkwell.Repo
  alias Inkwell.Journals.Comment
  alias Inkwell.Federation.CommentFederation
  alias InkwellWeb.Helpers.MentionHelper

  require Logger

  # GET /api/users/:username/entries/:slug/comments
  def index(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         entry when not is_nil(entry) <- Journals.get_entry_by_slug(user.id, slug) do

      viewer = conn.assigns[:current_user]
      # Same rules as the entry page. Followers used to be treated as allowed
      # on private and custom-list entries too.
      accessible? = Journals.viewable_by?(entry, viewer)

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
      # Same rules as the entry page. Followers used to be treated as allowed
      # on private and custom-list entries too.
      accessible? = Journals.viewable_by?(entry, viewer)

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

        not Journals.viewable_by?(entry, user) ->
          conn |> put_status(:forbidden) |> json(%{error: "Cannot comment on this entry"})

        true ->
          attrs = %{
            "entry_id" => entry_id,
            "user_id" => user.id,
            "body_html" => params["body_html"],
            "parent_comment_id" => params["parent_comment_id"],
            "user_icon_id" => Inkwell.Userpics.owned_id(user.id, params["user_icon_id"]),
            "ap_id" => "https://#{Inkwell.Instance.instance_host()}/comments/#{:erlang.unique_integer([:positive])}"
          }

          # Convert @mentions to profile links in body_html
          body_html = params["body_html"] || ""
          {processed_html, mentioned_users} = MentionHelper.process_mentions(body_html)
          attrs = Map.put(attrs, "body_html", processed_html)

          # Federation threads the reply under the comment it answers.
          replied_to = reply_parent(params["parent_comment_id"], entry.id)

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
              maybe_federate_comment(comment, replied_to)

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
              CommentFederation.deliver(comment, :update)
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
        # Queued first: the Delete needs the footnote's entry and parent.
        CommentFederation.retract(comment)
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
    # Listings preload it (no query then); a comment just created doesn't.
    comment = Inkwell.Repo.preload(comment, :user_icon)
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: Avatars.avatar_url(comment.user),
          avatar_frame: comment.user.avatar_frame,
          avatar_animation: comment.user.avatar_animation,
          subscription_tier: Inkwell.SelfHosted.effective_tier(comment.user)
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
            ap_id: ra["ap_id"] || ra[:ap_id],
            # "livejournal" / "dreamwidth" for imported comments; nil for fediverse
            source: ra["source"] || ra[:source]
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
      userpic: Inkwell.Userpics.render(comment.user_icon),
      ap_id: comment.ap_id,
      url: comment.url,
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

  # The comment being replied to, if it's on this entry.
  defp reply_parent(parent_id, entry_id) when is_binary(parent_id) and parent_id != "" do
    with {:ok, _} <- Ecto.UUID.cast(parent_id),
         %Journals.Comment{entry_id: ^entry_id} = parent <- Repo.get(Journals.Comment, parent_id) do
      parent
    else
      _ -> nil
    end
  end

  defp reply_parent(_, _), do: nil

  # Footnotes on public entries reach the fediverse as replies (see
  # CommentFederation); `replied_to` threads them under the comment answered.
  defp maybe_federate_comment(comment, replied_to) do
    CommentFederation.deliver(comment, :create, replied_to: replied_to)
  end

end
