defmodule Inkwell.Feedback do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Feedback.{FeedbackPost, FeedbackVote, FeedbackComment}

  # ── Posts ──────────────────────────────────────────────────────────────────

  def get_post(id), do: Repo.get(FeedbackPost, id)

  def get_post!(id), do: Repo.get!(FeedbackPost, id)

  @open_statuses [:new, :under_review, :planned, :in_progress]

  def list_posts(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    category = Keyword.get(opts, :category)
    status = Keyword.get(opts, :status)
    sort = Keyword.get(opts, :sort, "newest")

    query = FeedbackPost |> preload(:user)

    query = if category, do: where(query, category: ^category), else: query
    query = if status, do: where(query, status: ^status), else: where(query, [p], p.status not in [:done, :declined])

    query
    |> filter_search(Keyword.get(opts, :q))
    |> apply_sort(sort)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  @doc """
  Every post in a group, in the order the roadmap page shows them, with just
  enough to flip from one to the next. Groups: "open", "shipped", "declined",
  "all". Shipped posts always run newest-shipped first.
  """
  def list_outline(group, opts \\ []) do
    sort = if group == "shipped", do: "recently_shipped", else: Keyword.get(opts, :sort, "most_voted")

    numbers =
      from(p in FeedbackPost,
        select: %{id: p.id, number: over(row_number(), order_by: [asc: p.inserted_at, asc: p.id])}
      )

    FeedbackPost
    |> join(:left, [p], u in assoc(p, :user))
    |> join(:inner, [p], n in subquery(numbers), on: n.id == p.id)
    |> filter_group(group)
    |> then(fn q ->
      case Keyword.get(opts, :category) do
        nil -> q
        c -> where(q, [p], p.category == ^c)
      end
    end)
    |> filter_search(Keyword.get(opts, :q))
    |> apply_sort(sort)
    |> limit(1000)
    |> select([p, u, n], %{
      id: p.id,
      number: n.number,
      title: p.title,
      status: p.status,
      category: p.category,
      vote_count: p.vote_count,
      comment_count: p.comment_count,
      user_id: p.user_id,
      username: u.username,
      created_at: p.inserted_at,
      completed_at: p.completed_at
    })
    |> Repo.all()
  end

  @doc "A post's catalogue number: its place among every post ever filed, oldest first."
  def post_number(%FeedbackPost{id: id, inserted_at: ins}) do
    FeedbackPost
    |> where([p], p.inserted_at < ^ins or (p.inserted_at == ^ins and p.id <= ^id))
    |> select([p], count(p.id))
    |> Repo.one()
  end

  @doc "Counts for the roadmap's masthead."
  def roadmap_summary do
    counts =
      FeedbackPost
      |> group_by([p], p.status)
      |> select([p], {p.status, count(p.id)})
      |> Repo.all()
      |> Map.new()

    open = Enum.reduce(@open_statuses, 0, &(&2 + Map.get(counts, &1, 0)))

    shipped_by_month =
      FeedbackPost
      |> where([p], p.status == :done and not is_nil(p.completed_at))
      |> group_by([p], fragment("date_trunc('month', ?)", p.completed_at))
      |> select([p], {fragment("to_char(date_trunc('month', ?), 'YYYY-MM')", p.completed_at), count(p.id)})
      |> order_by([p], fragment("date_trunc('month', ?)", p.completed_at))
      |> Repo.all()
      |> Enum.map(fn {month, n} -> %{month: month, count: n} end)

    contributors =
      FeedbackPost
      |> where([p], not is_nil(p.user_id))
      |> select([p], count(p.user_id, :distinct))
      |> Repo.one()

    since = FeedbackPost |> select([p], min(p.inserted_at)) |> Repo.one()

    %{
      open: open,
      shipped: Map.get(counts, :done, 0),
      declined: Map.get(counts, :declined, 0),
      by_status: Map.new(counts, fn {k, v} -> {to_string(k), v} end),
      contributors: contributors || 0,
      since: since,
      shipped_by_month: shipped_by_month
    }
  end

  defp filter_group(query, "open"), do: where(query, [p], p.status in ^@open_statuses)
  defp filter_group(query, "shipped"), do: where(query, [p], p.status == :done)
  defp filter_group(query, "declined"), do: where(query, [p], p.status == :declined)
  defp filter_group(query, _all), do: query

  defp filter_search(query, q) when is_binary(q) do
    case String.trim(q) do
      term when byte_size(term) >= 2 ->
        like = "%" <> String.replace(term, ~r/[\\%_]/, fn c -> "\\" <> c end) <> "%"

        where(
          query,
          [p],
          ilike(p.title, ^like) or ilike(p.body, ^like) or ilike(p.release_note, ^like)
        )

      _ ->
        query
    end
  end

  defp filter_search(query, _), do: query

  defp apply_sort(query, sort) do
    case sort do
      "most_voted" ->
        order_by(query, [p], [desc: p.vote_count, desc: p.inserted_at])

      "priority_score" ->
        order_by(query, [p], [
          desc:
            fragment(
              "CASE WHEN ? IS NOT NULL OR ? IS NOT NULL THEN (CASE ? WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END::float / 4.0 * 40 + COALESCE(?, 0)::float / 5.0 * 40 + LEAST(COALESCE(?, 0), 10)::float / 10.0 * 20) ELSE 0 END",
              p.priority,
              p.value_score,
              p.priority,
              p.value_score,
              p.vote_count
            ),
          desc: p.inserted_at
        ])

      "recently_updated" ->
        order_by(query, [p], [desc: p.updated_at, desc: p.id])

      "recently_shipped" ->
        order_by(query, [p], [
          desc_nulls_last: p.completed_at,
          desc: p.updated_at,
          desc: p.id
        ])

      _ ->
        order_by(query, [p], [desc: p.inserted_at, desc: p.id])
    end
  end

  def create_post(attrs) do
    %FeedbackPost{}
    |> FeedbackPost.changeset(attrs)
    |> Repo.insert()
  end

  def update_post_user(%FeedbackPost{} = post, attrs) do
    post
    |> FeedbackPost.user_changeset(attrs)
    |> Repo.update()
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

  def count_release_notes do
    FeedbackPost
    |> where([p], p.status == :done and not is_nil(p.release_note))
    |> Repo.aggregate(:count)
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

  def update_comment(%FeedbackComment{} = comment, attrs) do
    comment
    |> FeedbackComment.edit_changeset(attrs)
    |> Repo.update()
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
