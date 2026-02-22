defmodule Inkwell.Feedback do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Feedback.{FeedbackPost, FeedbackVote, FeedbackComment}

  # ── Posts ──────────────────────────────────────────────────────────────────

  def get_post(id), do: Repo.get(FeedbackPost, id)

  def get_post!(id), do: Repo.get!(FeedbackPost, id)

  def list_posts(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    category = Keyword.get(opts, :category)
    status = Keyword.get(opts, :status)
    sort = Keyword.get(opts, :sort, "newest")

    query = FeedbackPost |> preload(:user)

    query = if category, do: where(query, category: ^category), else: query
    query = if status, do: where(query, status: ^status), else: query

    query =
      case sort do
        "most_voted" -> order_by(query, [p], [desc: p.vote_count, desc: p.inserted_at])
        "recently_updated" -> order_by(query, desc: :updated_at)
        _ -> order_by(query, desc: :inserted_at)
      end

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def create_post(attrs) do
    %FeedbackPost{}
    |> FeedbackPost.changeset(attrs)
    |> Repo.insert()
  end

  def update_post_admin(%FeedbackPost{} = post, attrs) do
    post
    |> FeedbackPost.admin_changeset(attrs)
    |> Repo.update()
  end

  # ── Roadmap & Releases ────────────────────────────────────────────────────

  def list_roadmap_items do
    FeedbackPost
    |> where([p], p.status in [:under_review, :planned, :in_progress])
    |> order_by([p], [desc: p.vote_count, desc: p.inserted_at])
    |> preload(:user)
    |> Repo.all()
  end

  def list_release_notes(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 10)

    FeedbackPost
    |> where([p], p.status == :done and not is_nil(p.release_note))
    |> order_by([p], [desc: p.completed_at, desc: p.inserted_at])
    |> preload(:user)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  # ── Votes ──────────────────────────────────────────────────────────────────

  def toggle_vote(user_id, post_id) do
    case Repo.get_by(FeedbackVote, user_id: user_id, feedback_post_id: post_id) do
      nil -> add_vote(user_id, post_id)
      vote -> remove_vote(vote)
    end
  end

  defp add_vote(user_id, post_id) do
    Repo.transaction(fn ->
      case %FeedbackVote{}
           |> FeedbackVote.changeset(%{user_id: user_id, feedback_post_id: post_id})
           |> Repo.insert() do
        {:ok, vote} ->
          FeedbackPost
          |> where(id: ^post_id)
          |> Repo.update_all(inc: [vote_count: 1])

          vote

        {:error, changeset} ->
          Repo.rollback(changeset)
      end
    end)
  end

  defp remove_vote(%FeedbackVote{} = vote) do
    post_id = vote.feedback_post_id

    Repo.transaction(fn ->
      Repo.delete!(vote)

      FeedbackPost
      |> where(id: ^post_id)
      |> Repo.update_all(inc: [vote_count: -1])

      :removed
    end)
  end

  def remove_vote_by_user(user_id, post_id) do
    case Repo.get_by(FeedbackVote, user_id: user_id, feedback_post_id: post_id) do
      nil -> {:error, :not_found}
      vote -> remove_vote(vote)
    end
  end

  def user_voted?(user_id, post_id) do
    FeedbackVote
    |> where(user_id: ^user_id, feedback_post_id: ^post_id)
    |> Repo.exists?()
  end

  def user_voted_post_ids(user_id, post_ids) when is_list(post_ids) do
    FeedbackVote
    |> where([v], v.user_id == ^user_id and v.feedback_post_id in ^post_ids)
    |> select([v], v.feedback_post_id)
    |> Repo.all()
    |> MapSet.new()
  end

  # ── Comments ───────────────────────────────────────────────────────────────

  def list_comments(post_id) do
    FeedbackComment
    |> where(feedback_post_id: ^post_id)
    |> order_by(:inserted_at)
    |> preload(:user)
    |> Repo.all()
  end

  def get_comment!(id), do: Repo.get!(FeedbackComment, id)

  def create_comment(attrs) do
    result =
      %FeedbackComment{}
      |> FeedbackComment.changeset(attrs)
      |> Repo.insert()

    case result do
      {:ok, comment} ->
        FeedbackPost
        |> where(id: ^comment.feedback_post_id)
        |> Repo.update_all(inc: [comment_count: 1])

        {:ok, comment}

      error ->
        error
    end
  end

  def delete_comment(%FeedbackComment{} = comment) do
    post_id = comment.feedback_post_id
    result = Repo.delete(comment)

    case result do
      {:ok, _} ->
        FeedbackPost
        |> where(id: ^post_id)
        |> Repo.update_all(inc: [comment_count: -1])

        result

      error ->
        error
    end
  end
end
