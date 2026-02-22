defmodule InkwellWeb.FeedbackController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Feedback, Email}

  require Logger

  # GET /api/feedback/roadmap — public Kanban-style roadmap items
  def roadmap(conn, _params) do
    items = Feedback.list_roadmap_items()
    viewer = conn.assigns[:current_user]

    voted_ids =
      if viewer do
        post_ids = Enum.map(items, & &1.id)
        Feedback.user_voted_post_ids(viewer.id, post_ids)
      else
        MapSet.new()
      end

    grouped =
      items
      |> Enum.group_by(& &1.status)
      |> Map.new(fn {status, posts} ->
        {status, Enum.map(posts, fn p -> render_post(p, MapSet.member?(voted_ids, p.id)) end)}
      end)

    json(conn, %{
      data: %{
        under_review: Map.get(grouped, :under_review, []),
        planned: Map.get(grouped, :planned, []),
        in_progress: Map.get(grouped, :in_progress, [])
      }
    })
  end

  # GET /api/feedback/releases — shipped items with release notes
  def releases(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 10), 50)

    posts = Feedback.list_release_notes(page: page, per_page: per_page)
    viewer = conn.assigns[:current_user]

    voted_ids =
      if viewer do
        post_ids = Enum.map(posts, & &1.id)
        Feedback.user_voted_post_ids(viewer.id, post_ids)
      else
        MapSet.new()
      end

    json(conn, %{
      data:
        Enum.map(posts, fn post ->
          render_post(post, MapSet.member?(voted_ids, post.id))
        end),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # GET /api/feedback — list posts (public, optional auth for vote status)
  def index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 20), 50)

    category =
      if params["category"] in ~w(bug feature idea question), do: params["category"]

    status =
      if params["status"] in ~w(new under_review planned in_progress done declined),
        do: params["status"]

    sort =
      if params["sort"] in ~w(newest most_voted recently_updated),
        do: params["sort"],
        else: "newest"

    posts =
      Feedback.list_posts(
        page: page,
        per_page: per_page,
        category: category,
        status: status,
        sort: sort
      )

    viewer = conn.assigns[:current_user]

    voted_ids =
      if viewer do
        post_ids = Enum.map(posts, & &1.id)
        Feedback.user_voted_post_ids(viewer.id, post_ids)
      else
        MapSet.new()
      end

    json(conn, %{
      data:
        Enum.map(posts, fn post ->
          render_post(post, MapSet.member?(voted_ids, post.id))
        end),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # GET /api/feedback/:id — single post with comments
  def show(conn, %{"id" => id}) do
    case Feedback.get_post(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Post not found"})

      post ->
        post = Inkwell.Repo.preload(post, :user)
        comments = Feedback.list_comments(id)
        viewer = conn.assigns[:current_user]
        voted = if viewer, do: Feedback.user_voted?(viewer.id, id), else: false

        json(conn, %{
          data:
            render_post(post, voted)
            |> Map.put(:comments, Enum.map(comments, &render_feedback_comment/1))
        })
    end
  end

  # POST /api/feedback — create post (auth required)
  def create(conn, params) do
    user = conn.assigns.current_user

    attrs = %{
      "title" => params["title"],
      "body" => params["body"],
      "category" => params["category"],
      "user_id" => user.id
    }

    case Feedback.create_post(attrs) do
      {:ok, post} ->
        # Send email notification to admin (fire-and-forget)
        category_label = params["category"] || "idea"
        message = "#{params["title"]}\n\n#{params["body"]}"
        Task.start(fn -> Email.send_feedback(user, category_label, message) end)

        Logger.info("Feedback post created by #{user.username}: [#{category_label}] #{params["title"]}")

        post = Inkwell.Repo.preload(post, :user)
        conn |> put_status(:created) |> json(%{data: render_post(post, false)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # PATCH /api/feedback/:id — admin-only: update status, admin_response
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    if not Accounts.is_admin?(user) do
      conn |> put_status(:forbidden) |> json(%{error: "Admin only"})
    else
      case Feedback.get_post(id) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: "Post not found"})

        post ->
          attrs = Map.take(params, ["status", "admin_response", "release_note"])

          case Feedback.update_post_admin(post, attrs) do
            {:ok, updated} ->
              updated = Inkwell.Repo.preload(updated, :user)
              json(conn, %{data: render_post(updated, false)})

            {:error, changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{errors: format_errors(changeset)})
          end
      end
    end
  end

  # POST /api/feedback/:id/vote — toggle upvote (auth required)
  def vote(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Feedback.get_post(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Post not found"})

      _post ->
        case Feedback.toggle_vote(user.id, id) do
          {:ok, %Inkwell.Feedback.FeedbackVote{}} ->
            post = Feedback.get_post!(id)
            json(conn, %{data: %{voted: true, vote_count: post.vote_count}})

          {:ok, :removed} ->
            post = Feedback.get_post!(id)
            json(conn, %{data: %{voted: false, vote_count: post.vote_count}})

          {:error, _} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "Could not process vote"})
        end
    end
  end

  # DELETE /api/feedback/:id/vote — remove upvote (auth required)
  def unvote(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Feedback.remove_vote_by_user(user.id, id) do
      {:ok, _} ->
        post = Feedback.get_post!(id)
        json(conn, %{data: %{voted: false, vote_count: post.vote_count}})

      {:error, :not_found} ->
        json(conn, %{data: %{voted: false}})
    end
  end

  # POST /api/feedback/:id/comments — add comment (auth required)
  def create_comment(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case Feedback.get_post(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Post not found"})

      _post ->
        attrs = %{
          "body" => params["body"],
          "user_id" => user.id,
          "feedback_post_id" => id
        }

        case Feedback.create_comment(attrs) do
          {:ok, comment} ->
            comment = Inkwell.Repo.preload(comment, :user)
            conn |> put_status(:created) |> json(%{data: render_feedback_comment(comment)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  # DELETE /api/feedback/comments/:comment_id — delete own comment or admin
  def delete_comment(conn, %{"comment_id" => comment_id}) do
    user = conn.assigns.current_user

    case Inkwell.Repo.get(Inkwell.Feedback.FeedbackComment, comment_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Comment not found"})

      comment ->
        can_delete = comment.user_id == user.id || Accounts.is_admin?(user)

        if can_delete do
          {:ok, _} = Feedback.delete_comment(comment)
          send_resp(conn, :no_content, "")
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not your comment"})
        end
    end
  end

  # ── Renderers ──────────────────────────────────────────────────────────────

  defp render_post(post, voted) do
    author =
      if post.user do
        %{
          id: post.user.id,
          username: post.user.username,
          display_name: post.user.display_name,
          avatar_url: post.user.avatar_url
        }
      else
        %{id: nil, username: "[deleted]", display_name: "[Deleted User]", avatar_url: nil}
      end

    %{
      id: post.id,
      title: post.title,
      body: post.body,
      category: post.category,
      status: post.status,
      admin_response: post.admin_response,
      release_note: post.release_note,
      completed_at: post.completed_at,
      vote_count: post.vote_count,
      comment_count: post.comment_count,
      voted: voted,
      author: author,
      created_at: post.inserted_at,
      updated_at: post.updated_at
    }
  end

  defp render_feedback_comment(comment) do
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: comment.user.avatar_url
        }
      else
        %{id: nil, username: "[deleted]", display_name: "[Deleted User]", avatar_url: nil}
      end

    %{
      id: comment.id,
      body: comment.body,
      author: author,
      created_at: comment.inserted_at
    }
  end

  # ── Helpers ────────────────────────────────────────────────────────────────

  defp parse_int(nil, default), do: default

  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end

  defp parse_int(val, _) when is_integer(val), do: val

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
