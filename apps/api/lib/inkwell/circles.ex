defmodule Inkwell.Circles do
  @moduledoc """
  Context for Circles — writing circles (group discussion spaces) with Writer's Salon aesthetic.
  Plus-only creation (up to 10). Free users can join and participate.
  """

  import Ecto.Query
  alias Ecto.Multi
  alias Inkwell.Repo
  alias Inkwell.Circles.{Circle, CircleDiscussion, CircleMember, CircleResponse}

  @max_circles_per_user 10

  # ── Circle CRUD ──────────────────────────────────────────────────────────

  def create_circle(user, attrs) do
    count = count_circles_by_owner(user.id)

    if count >= @max_circles_per_user do
      {:error, :circle_limit_reached}
    else
      now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

      multi =
        Multi.new()
        |> Multi.insert(:circle, Circle.changeset(%Circle{}, Map.put(attrs, "owner_id", user.id)))
        |> Multi.run(:owner_member, fn repo, %{circle: circle} ->
          %CircleMember{}
          |> CircleMember.changeset(%{circle_id: circle.id, user_id: user.id, role: :owner})
          |> repo.insert()
        end)
        |> Multi.run(:set_counts, fn repo, %{circle: circle} ->
          Circle
          |> where(id: ^circle.id)
          |> repo.update_all(set: [member_count: 1, last_activity_at: now])

          {:ok, :done}
        end)

      case Repo.transaction(multi) do
        {:ok, %{circle: circle}} ->
          # Reload to pick up member_count/last_activity_at set by update_all
          {:ok, Repo.get!(Circle, circle.id) |> Repo.preload(:owner)}

        {:error, :circle, changeset, _} ->
          {:error, changeset}

        {:error, _, reason, _} ->
          {:error, reason}
      end
    end
  end

  def get_circle(id) do
    Circle
    |> Repo.get(id)
    |> case do
      nil -> nil
      circle -> Repo.preload(circle, :owner)
    end
  end

  def get_circle_by_slug(slug) do
    Circle
    |> where(slug: ^slug)
    |> preload(:owner)
    |> Repo.one()
  end

  def update_circle(%Circle{} = circle, attrs) do
    circle
    |> Circle.update_changeset(attrs)
    |> Repo.update()
  end

  def delete_circle(%Circle{} = circle) do
    Repo.delete(circle)
  end

  def count_circles_by_owner(user_id) do
    Circle
    |> where(owner_id: ^user_id)
    |> Repo.aggregate(:count)
  end

  def list_circles(opts \\ %{}) do
    page = parse_int(opts["page"], 1)
    per_page = parse_int(opts["per_page"], 20)
    category = opts["category"]
    search = opts["search"]
    exclude_owner_ids = Map.get(opts, :exclude_owner_ids, [])

    query =
      Circle
      |> where(visibility: :public)
      |> preload(:owner)

    query =
      if category && category != "" do
        where(query, category: ^category)
      else
        query
      end

    query =
      if search && String.trim(search) != "" do
        term = "%#{String.trim(search)}%"
        where(query, [c], ilike(c.name, ^term) or ilike(c.description, ^term))
      else
        query
      end

    query =
      if exclude_owner_ids != [] do
        where(query, [c], c.owner_id not in ^exclude_owner_ids)
      else
        query
      end

    # Starter circles first, then by last activity
    query =
      query
      |> order_by([c], [
        desc: c.is_starter,
        desc_nulls_last: c.last_activity_at,
        desc: c.inserted_at
      ])

    total = Repo.aggregate(query, :count)

    circles =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {circles, total}
  end

  # ── Membership ───────────────────────────────────────────────────────────

  def join_circle(circle_id, user_id) do
    multi =
      Multi.new()
      |> Multi.insert(:member, CircleMember.changeset(%CircleMember{}, %{
        circle_id: circle_id,
        user_id: user_id,
        role: :member
      }))
      |> Multi.run(:increment, fn repo, _ ->
        {1, _} =
          Circle
          |> where(id: ^circle_id)
          |> repo.update_all(inc: [member_count: 1])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, %{member: member}} -> {:ok, member}
      {:error, :member, changeset, _} -> {:error, changeset}
    end
  end

  def leave_circle(circle_id, user_id) do
    member = get_membership(circle_id, user_id)

    cond do
      is_nil(member) ->
        {:error, :not_member}

      member.role == :owner ->
        {:error, :owner_cannot_leave}

      true ->
        multi =
          Multi.new()
          |> Multi.delete(:member, member)
          |> Multi.run(:decrement, fn repo, _ ->
            {_, _} =
              Circle
              |> where(id: ^circle_id)
              |> repo.update_all(inc: [member_count: -1])

            {:ok, :done}
          end)

        case Repo.transaction(multi) do
          {:ok, _} -> {:ok, :left}
          {:error, _, reason, _} -> {:error, reason}
        end
    end
  end

  def get_membership(circle_id, user_id) do
    CircleMember
    |> where(circle_id: ^circle_id, user_id: ^user_id)
    |> Repo.one()
  end

  def is_member?(circle_id, user_id) do
    CircleMember
    |> where(circle_id: ^circle_id, user_id: ^user_id)
    |> Repo.exists?()
  end

  def get_user_role(circle_id, user_id) when is_binary(circle_id) and is_binary(user_id) do
    CircleMember
    |> where(circle_id: ^circle_id, user_id: ^user_id)
    |> select([m], m.role)
    |> Repo.one()
  end

  def get_user_role(_, _), do: nil

  def get_user_memberships(user_id) do
    CircleMember
    |> where(user_id: ^user_id)
    |> preload(circle: :owner)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
  end

  def list_members(circle_id, opts \\ %{}) do
    page = parse_int(opts["page"], 1)
    per_page = parse_int(opts["per_page"], 30)
    exclude_user_ids = Map.get(opts, :exclude_user_ids, [])

    query =
      CircleMember
      |> where(circle_id: ^circle_id)
      |> preload(:user)
      |> order_by([m], [
        fragment("CASE WHEN ? = 'owner' THEN 0 WHEN ? = 'moderator' THEN 1 ELSE 2 END", m.role, m.role),
        asc: m.inserted_at
      ])

    query =
      if exclude_user_ids != [] do
        where(query, [m], m.user_id not in ^exclude_user_ids)
      else
        query
      end

    total = Repo.aggregate(query, :count)

    members =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {members, total}
  end

  def get_member_preview(circle_id, limit \\ 12) do
    CircleMember
    |> where(circle_id: ^circle_id)
    |> preload(:user)
    |> order_by([m], [
      fragment("CASE WHEN ? = 'owner' THEN 0 WHEN ? = 'moderator' THEN 1 ELSE 2 END", m.role, m.role),
      asc: m.inserted_at
    ])
    |> limit(^limit)
    |> Repo.all()
  end

  def get_user_membership_ids(user_id) when is_binary(user_id) do
    CircleMember
    |> where(user_id: ^user_id)
    |> select([m], m.circle_id)
    |> Repo.all()
    |> MapSet.new()
  end

  def get_user_membership_ids(_), do: MapSet.new()

  def update_member_role(circle_id, target_user_id, new_role) when new_role in [:moderator, :member] do
    case get_membership(circle_id, target_user_id) do
      nil ->
        {:error, :not_member}

      %{role: :owner} ->
        {:error, :cannot_change_owner}

      %{role: ^new_role} ->
        {:error, :already_that_role}

      member ->
        member
        |> Ecto.Changeset.change(role: new_role)
        |> Repo.update()
    end
  end

  def update_member_role(_, _, _), do: {:error, :invalid_role}

  def remove_member(circle_id, target_user_id) do
    case get_membership(circle_id, target_user_id) do
      nil ->
        {:error, :not_member}

      %{role: :owner} ->
        {:error, :cannot_remove_owner}

      member ->
        multi =
          Multi.new()
          |> Multi.delete(:member, member)
          |> Multi.run(:decrement, fn repo, _ ->
            {_, _} =
              Circle
              |> where(id: ^circle_id)
              |> repo.update_all(inc: [member_count: -1])

            {:ok, :done}
          end)

        case Repo.transaction(multi) do
          {:ok, _} -> {:ok, :removed}
          {:error, _, reason, _} -> {:error, reason}
        end
    end
  end

  # ── Discussions ──────────────────────────────────────────────────────────

  def create_discussion(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    circle_id = attrs["circle_id"] || attrs[:circle_id]

    multi =
      Multi.new()
      |> Multi.insert(:discussion, CircleDiscussion.changeset(%CircleDiscussion{}, attrs))
      |> Multi.run(:update_circle, fn repo, _ ->
        {_, _} =
          Circle
          |> where(id: ^circle_id)
          |> repo.update_all(inc: [discussion_count: 1], set: [last_activity_at: now])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, %{discussion: discussion}} ->
        {:ok, Repo.preload(discussion, :author)}

      {:error, :discussion, changeset, _} ->
        {:error, changeset}
    end
  end

  def get_discussion(id) do
    CircleDiscussion
    |> Repo.get(id)
    |> case do
      nil -> nil
      discussion -> Repo.preload(discussion, [:author, :circle])
    end
  end

  @doc """
  Returns up to 3 most recent discussions (title, author name, response_count, date)
  for non-member preview. No body content exposed.
  """
  def get_discussion_preview(circle_id) do
    CircleDiscussion
    |> where(circle_id: ^circle_id)
    |> preload(:author)
    |> order_by([d], [desc_nulls_last: d.last_response_at, desc: d.inserted_at])
    |> limit(3)
    |> Repo.all()
  end

  def list_discussions(circle_id, opts \\ %{}) do
    page = parse_int(opts["page"], 1)
    per_page = parse_int(opts["per_page"], 20)
    exclude_author_ids = Map.get(opts, :exclude_author_ids, [])

    query =
      CircleDiscussion
      |> where(circle_id: ^circle_id)
      |> preload(:author)

    query =
      if exclude_author_ids != [] do
        where(query, [d], is_nil(d.author_id) or d.author_id not in ^exclude_author_ids)
      else
        query
      end

    # Pinned first, then by last_response_at (most active), then by inserted_at
    query =
      query
      |> order_by([d], [
        desc: d.is_pinned,
        desc_nulls_last: d.last_response_at,
        desc: d.inserted_at
      ])

    total = Repo.aggregate(query, :count)

    discussions =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {discussions, total}
  end

  def delete_discussion(%CircleDiscussion{} = discussion) do
    multi =
      Multi.new()
      |> Multi.delete(:discussion, discussion)
      |> Multi.run(:decrement, fn repo, _ ->
        {_, _} =
          Circle
          |> where(id: ^discussion.circle_id)
          |> repo.update_all(inc: [discussion_count: -1])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, _} -> {:ok, discussion}
      {:error, :discussion, changeset, _} -> {:error, changeset}
    end
  end

  # ── Responses ────────────────────────────────────────────────────────────

  def create_response(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    discussion_id = attrs["discussion_id"] || attrs[:discussion_id]

    # Get the discussion to find circle_id
    discussion = get_discussion(discussion_id)

    if is_nil(discussion) do
      {:error, :discussion_not_found}
    else
      multi =
        Multi.new()
        |> Multi.insert(:response, CircleResponse.changeset(%CircleResponse{}, attrs))
        |> Multi.run(:update_discussion, fn repo, _ ->
          {_, _} =
            CircleDiscussion
            |> where(id: ^discussion_id)
            |> repo.update_all(inc: [response_count: 1], set: [last_response_at: now])

          {:ok, :done}
        end)
        |> Multi.run(:update_circle, fn repo, _ ->
          {_, _} =
            Circle
            |> where(id: ^discussion.circle_id)
            |> repo.update_all(set: [last_activity_at: now])

          {:ok, :done}
        end)

      case Repo.transaction(multi) do
        {:ok, %{response: response}} ->
          {:ok, Repo.preload(response, :author)}

        {:error, :response, changeset, _} ->
          {:error, changeset}
      end
    end
  end

  def list_responses(discussion_id, opts \\ %{}) do
    page = parse_int(opts["page"], 1)
    per_page = parse_int(opts["per_page"], 30)
    exclude_author_ids = Map.get(opts, :exclude_author_ids, [])

    query =
      CircleResponse
      |> where(discussion_id: ^discussion_id)
      |> preload(:author)
      |> order_by(asc: :inserted_at)

    query =
      if exclude_author_ids != [] do
        where(query, [r], is_nil(r.author_id) or r.author_id not in ^exclude_author_ids)
      else
        query
      end

    total = Repo.aggregate(query, :count)

    responses =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {responses, total}
  end

  def get_response(id) do
    CircleResponse
    |> Repo.get(id)
    |> case do
      nil -> nil
      response -> Repo.preload(response, [:author, discussion: :circle])
    end
  end

  def update_response(%CircleResponse{} = response, attrs) do
    response
    |> CircleResponse.edit_changeset(attrs)
    |> Repo.update()
  end

  def delete_response(%CircleResponse{} = response) do
    multi =
      Multi.new()
      |> Multi.delete(:response, response)
      |> Multi.run(:decrement, fn repo, _ ->
        {_, _} =
          CircleDiscussion
          |> where(id: ^response.discussion_id)
          |> repo.update_all(inc: [response_count: -1])

        {:ok, :done}
      end)

    case Repo.transaction(multi) do
      {:ok, _} -> {:ok, response}
      {:error, :response, changeset, _} -> {:error, changeset}
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _default) when is_integer(val), do: max(val, 1)
  defp parse_int(_, default), do: default
end
