defmodule Inkwell.Circles do
  @moduledoc """
  Circles are LiveJournal-style communities. Members post ordinary entries
  "to" a circle (`entries.circle_id`); each entry stays on its writer's
  journal and also shows on the circle page and in every member's Feed.
  `privacy: :circle` limits an entry to the circle's members. The owner or a
  moderator can pin one entry as the circle's prompt; entries answering it
  carry `circle_prompt_id`.

  Anyone established can start a circle (7+ days old, not moderation-limited):
  3 on the free plan, 10 on Plus.

  The discussion/response tables are from the first version (March 2026) and
  are kept read-only as each circle's archive.
  """

  import Ecto.Query
  alias Ecto.Multi
  alias Inkwell.Repo
  alias Inkwell.Circles.{Circle, CircleDiscussion, CircleMember, CircleResponse}
  alias Inkwell.Journals.Entry

  @free_circle_limit 3
  @plus_circle_limit 10
  @min_account_age_days 7

  # ── Circle CRUD ──────────────────────────────────────────────────────────

  @doc """
  Whether `user` may start a circle: `%{can_create, reason, limit, owned}`.
  `reason` is nil, `:too_new`, `:limited` or `:limit_reached`.
  """
  def creation_status(user) do
    owned = count_circles_by_owner(user.id)

    limit =
      if Inkwell.SelfHosted.effective_tier(user) == "plus", do: @plus_circle_limit, else: @free_circle_limit

    age_days =
      case user.inserted_at do
        %NaiveDateTime{} = at -> NaiveDateTime.diff(NaiveDateTime.utc_now(), at, :day)
        %DateTime{} = at -> DateTime.diff(DateTime.utc_now(), at, :day)
        _ -> 0
      end

    reason =
      cond do
        user.role == "admin" -> nil
        age_days < @min_account_age_days -> :too_new
        user.moderation_state == "limited" -> :limited
        owned >= limit -> :limit_reached
        true -> nil
      end

    %{can_create: is_nil(reason), reason: reason, limit: limit, owned: owned,
      min_account_age_days: @min_account_age_days}
  end

  def create_circle(user, attrs) do
    case creation_status(user) do
      %{reason: nil} -> do_create_circle(user, attrs)
      %{reason: reason} -> {:error, reason}
    end
  end

  defp do_create_circle(user, attrs) do
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

  # Members-only posts would become visible to nobody but their writer once the
  # circle is gone (circle_id is nilified); make that explicit by marking them
  # private.
  def delete_circle(%Circle{} = circle) do
    Repo.transaction(fn ->
      from(e in Entry, where: e.circle_id == ^circle.id and e.privacy == :circle)
      |> Repo.update_all(set: [privacy: :private])

      case Repo.delete(circle) do
        {:ok, deleted} -> deleted
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
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

  # ── Entries posted to circles ────────────────────────────────────────────

  @doc "Ids of the circles `user_id` belongs to (a list, for `in ^ids`)."
  def member_circle_ids(nil), do: []

  def member_circle_ids(user_id) do
    CircleMember
    |> where(user_id: ^user_id)
    |> select([m], m.circle_id)
    |> Repo.all()
  end

  # Published entries in a circle that `viewer` may read: public ones for
  # everybody, members-only ones for members, the viewer's own always. Never
  # from suspended accounts or across a block.
  defp circle_entries_query(%Circle{id: circle_id}, viewer) do
    viewer_id = viewer && viewer.id
    member? = viewer_id != nil and is_member?(circle_id, viewer_id)
    blocked = if viewer_id, do: Inkwell.Social.get_blocked_user_ids(viewer_id), else: []

    query =
      from(e in Entry,
        join: u in assoc(e, :user),
        where: e.circle_id == ^circle_id and e.status == :published,
        where: not is_nil(e.published_at) and is_nil(u.blocked_at)
      )

    query =
      cond do
        member? -> where(query, [e], e.privacy in [:public, :circle] or e.user_id == ^viewer_id)
        viewer_id -> where(query, [e], e.privacy == :public or e.user_id == ^viewer_id)
        true -> where(query, [e], e.privacy == :public)
      end

    if blocked == [], do: query, else: where(query, [e], e.user_id not in ^blocked)
  end

  @doc """
  `{entries, total}` posted to `circle`, newest first. `prompt_id:` limits it
  to entries answering that prompt.
  """
  def list_circle_entries(%Circle{} = circle, viewer, opts \\ []) do
    page = max(Keyword.get(opts, :page, 1), 1)
    per_page = Keyword.get(opts, :per_page, 20)

    query = circle_entries_query(circle, viewer)

    query =
      case Keyword.get(opts, :prompt_id) do
        id when is_binary(id) -> where(query, [e], e.circle_prompt_id == ^id)
        _ -> query
      end

    # The circle page lists answers under their prompt, not as posts of their own.
    query = if Keyword.get(opts, :top_level), do: where(query, [e], is_nil(e.circle_prompt_id)), else: query

    query =
      case Keyword.get(opts, :exclude_id) do
        id when is_binary(id) -> where(query, [e], e.id != ^id)
        _ -> query
      end

    total = Repo.aggregate(query, :count)

    query =
      case Keyword.get(opts, :order, :newest) do
        # Thread list: most recent activity (the post or its newest answer) first
        :activity ->
          order_by(query, [e],
            desc:
              fragment(
                "GREATEST(?, COALESCE((SELECT max(a.published_at) FROM entries a WHERE a.circle_prompt_id = ? AND a.status = 'published'), ?))",
                e.published_at,
                e.id,
                e.published_at
              )
          )

        # Answers in a thread read top to bottom
        :oldest ->
          order_by(query, [e], asc: e.published_at)

        _ ->
          order_by(query, [e], desc: e.published_at)
      end

    entries =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> preload([:user])
      |> Repo.all()

    {entries, total}
  end

  @doc "Newest answer time per thread: `%{entry_id => DateTime}`."
  def last_answer_at([]), do: %{}

  def last_answer_at(ids) do
    from(e in Entry,
      where: e.circle_prompt_id in ^ids and e.status == :published,
      group_by: e.circle_prompt_id,
      select: {e.circle_prompt_id, max(e.published_at)}
    )
    |> Repo.all()
    |> Map.new()
  end

  @doc "One published entry in `circle` that `viewer` may read, or nil."
  def get_circle_entry(%Circle{} = circle, entry_id, viewer) do
    circle
    |> circle_entries_query(viewer)
    |> where([e], e.id == ^entry_id)
    |> preload([:user])
    |> Repo.one()
  end

  @doc """
  For each of `prompt_ids`: how many answers `viewer` can read and the newest
  `limit` of them, as `%{prompt_id => {count, [entry]}}` (oldest first, like a
  thread).
  """
  def answer_previews(_circle, _viewer, [], _limit), do: %{}

  def answer_previews(%Circle{} = circle, viewer, prompt_ids, limit) do
    base = circle |> circle_entries_query(viewer) |> where([e], e.circle_prompt_id in ^prompt_ids)

    counts =
      base
      |> group_by([e], e.circle_prompt_id)
      |> select([e], {e.circle_prompt_id, count(e.id)})
      |> Repo.all()
      |> Map.new()

    ranked =
      from(e in subquery(
             base
             |> select([e], %{
               id: e.id,
               prompt_id: e.circle_prompt_id,
               rank: over(row_number(), partition_by: e.circle_prompt_id, order_by: [desc: e.published_at])
             })
           ),
           where: e.rank <= ^limit,
           select: {e.prompt_id, e.id}
      )
      |> Repo.all()

    entries =
      from(e in Entry, where: e.id in ^Enum.map(ranked, &elem(&1, 1)), preload: [:user])
      |> Repo.all()
      |> Enum.sort_by(& &1.published_at, DateTime)
      |> Enum.group_by(& &1.circle_prompt_id)

    Map.new(counts, fn {pid, n} -> {pid, {n, Map.get(entries, pid, [])}} end)
  end

  @doc "`%{entry_id => title}` for a list of entry ids (for \"Answering …\" labels)."
  def entry_titles([]), do: %{}

  def entry_titles(ids) do
    from(e in Entry, where: e.id in ^Enum.uniq(ids), select: {e.id, e.title})
    |> Repo.all()
    |> Map.new()
  end

  @doc "The circle's current prompt, if `viewer` may read it."
  def current_prompt(%Circle{prompt_entry_id: nil}, _viewer), do: nil

  def current_prompt(%Circle{prompt_entry_id: id} = circle, viewer) do
    circle
    |> circle_entries_query(viewer)
    |> where([e], e.id == ^id)
    |> preload([:user])
    |> Repo.one()
  end

  @doc "Published entries per circle: `%{circle_id => count}`."
  def entry_counts([]), do: %{}

  def entry_counts(circle_ids) do
    from(e in Entry,
      where: e.circle_id in ^circle_ids and e.status == :published,
      group_by: e.circle_id,
      select: {e.circle_id, count(e.id)}
    )
    |> Repo.all()
    |> Map.new()
  end

  @doc "Responses per prompt: `%{prompt_entry_id => count}` (published, public or circle)."
  def prompt_response_counts([]), do: %{}

  def prompt_response_counts(prompt_ids) do
    from(e in Entry,
      where: e.circle_prompt_id in ^prompt_ids and e.status == :published,
      group_by: e.circle_prompt_id,
      select: {e.circle_prompt_id, count(e.id)}
    )
    |> Repo.all()
    |> Map.new()
  end

  @doc "`%{circle_id => %{id, name, slug}}`, for labelling entries in Feed and elsewhere."
  def labels([]), do: %{}

  def labels(circle_ids) do
    from(c in Circle, where: c.id in ^Enum.uniq(circle_ids), select: {c.id, %{id: c.id, name: c.name, slug: c.slug}})
    |> Repo.all()
    |> Map.new()
  end

  @doc """
  Pin `entry_id` as the circle's prompt and tell the other members. It has to
  be a published entry in this circle that members can read.
  """
  def set_prompt(%Circle{} = circle, entry_id, actor) do
    entry = Repo.get(Entry, entry_id)

    cond do
      is_nil(entry) or entry.circle_id != circle.id or entry.status != :published or
          entry.privacy not in [:public, :circle] ->
        {:error, :not_in_circle}

      circle.prompt_entry_id == entry.id ->
        {:ok, circle}

      true ->
        now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

        {1, _} =
          from(c in Circle, where: c.id == ^circle.id)
          |> Repo.update_all(set: [prompt_entry_id: entry.id, last_activity_at: now])

        notify_members(circle, actor.id, %{
          type: :circle_prompt,
          actor_id: actor.id,
          target_type: "entry",
          target_id: entry.id,
          data: %{circle_slug: circle.slug, circle_name: circle.name, prompt_title: entry.title}
        })

        {:ok, %{circle | prompt_entry_id: entry.id}}
    end
  end

  def clear_prompt(%Circle{} = circle) do
    from(c in Circle, where: c.id == ^circle.id) |> Repo.update_all(set: [prompt_entry_id: nil])
    {:ok, %{circle | prompt_entry_id: nil}}
  end

  # One notification per member. Circles are small; the cap keeps a large one
  # from turning a prompt into thousands of inserts in a request.
  defp notify_members(%Circle{id: circle_id}, except_user_id, attrs) do
    from(m in CircleMember,
      where: m.circle_id == ^circle_id and m.user_id != ^except_user_id,
      select: m.user_id,
      limit: 500
    )
    |> Repo.all()
    |> Enum.each(fn user_id ->
      Inkwell.Accounts.create_notification(Map.put(attrs, :user_id, user_id))
    end)
  end

  @doc """
  Take an entry out of a circle (the owner or a moderator removing something
  that doesn't belong, or a writer moving their post). It stays on the
  writer's journal; a members-only post becomes private, since it was never
  meant for everyone.
  """
  def detach_entry(%Circle{} = circle, %Entry{circle_id: circle_id} = entry) when circle_id == circle.id do
    privacy = if entry.privacy == :circle, do: :private, else: entry.privacy

    from(e in Entry, where: e.id == ^entry.id)
    |> Repo.update_all(set: [circle_id: nil, circle_prompt_id: nil, privacy: privacy])

    if circle.prompt_entry_id == entry.id, do: clear_prompt(circle)
    {:ok, %{entry | circle_id: nil, circle_prompt_id: nil, privacy: privacy}}
  end

  def detach_entry(_circle, _entry), do: {:error, :not_in_circle}

  @doc """
  Runs when an entry is published (by hand, bulk or on schedule): the circle
  shows recent activity, and the prompt's writer hears about the answer.
  """
  def after_entry_published(%Entry{circle_id: nil}), do: :ok

  def after_entry_published(%Entry{circle_id: circle_id} = entry) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    from(c in Circle, where: c.id == ^circle_id) |> Repo.update_all(set: [last_activity_at: now])

    with prompt_id when is_binary(prompt_id) <- entry.circle_prompt_id,
         %Entry{} = prompt <- Repo.get(Entry, prompt_id),
         true <- prompt.user_id != entry.user_id,
         %Circle{} = circle <- Repo.get(Circle, circle_id) do
      Inkwell.Accounts.create_notification(%{
        type: :circle_prompt_response,
        user_id: prompt.user_id,
        actor_id: entry.user_id,
        target_type: "entry",
        target_id: entry.id,
        data: %{circle_slug: circle.slug, circle_name: circle.name, prompt_title: prompt.title, prompt_id: prompt.id}
      })
    end

    :ok
  end

  @doc "Mark the circle read for a member (drives the \"N new\" count)."
  def mark_read(circle_id, user_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    from(m in CircleMember, where: m.circle_id == ^circle_id and m.user_id == ^user_id)
    |> Repo.update_all(set: [last_read_at: now])

    :ok
  end

  @doc """
  New posts by other people since the member last opened each circle:
  `%{circle_id => count}`. A member who never opened it counts from joining.
  """
  def unread_counts(user_id) do
    from(m in CircleMember,
      join: e in Entry,
      on: e.circle_id == m.circle_id,
      where: m.user_id == ^user_id and e.status == :published and e.user_id != ^user_id,
      where: e.privacy in [:public, :circle],
      where: e.published_at > coalesce(m.last_read_at, m.inserted_at),
      group_by: m.circle_id,
      select: {m.circle_id, count(e.id)}
    )
    |> Repo.all()
    |> Map.new()
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

  def update_discussion(%CircleDiscussion{} = discussion, attrs) do
    discussion
    |> CircleDiscussion.edit_changeset(attrs)
    |> Repo.update()
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
