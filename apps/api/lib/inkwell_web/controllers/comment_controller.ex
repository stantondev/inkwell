defmodule InkwellWeb.CommentController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Social}
  alias Inkwell.Repo
  alias Inkwell.Journals.Comment

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
        json(conn, %{data: Enum.map(comments, &render_comment/1)})
      else
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # POST /api/entries/:entry_id/comments
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    try do
      entry = Journals.get_entry!(entry_id)

      # Verify viewer can see the entry
      accessible? =
        entry.privacy == :public ||
        entry.user_id == user.id ||
        Social.is_friend?(user.id, entry.user_id)

      if accessible? do
        attrs = %{
          "entry_id" => entry_id,
          "user_id" => user.id,
          "body_html" => params["body_html"],
          "parent_comment_id" => params["parent_comment_id"],
          "user_icon_id" => params["user_icon_id"],
          "ap_id" => "https://inkwell.social/comments/#{:erlang.unique_integer([:positive])}"
        }

        case Journals.create_comment(attrs) do
          {:ok, comment} ->
            # Notify entry author (unless commenter is the author)
            if entry.user_id != user.id do
              Accounts.create_notification(%{
                user_id: entry.user_id,
                type: :comment,
                actor_id: user.id,
                target_type: "entry",
                target_id: entry_id
              })
            end

            conn |> put_status(:created) |> json(%{data: render_comment(comment)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      else
        conn |> put_status(:forbidden) |> json(%{error: "Cannot comment on this entry"})
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
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
          avatar_url: comment.user.avatar_url
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
      created_at: comment.inserted_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
