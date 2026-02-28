defmodule Inkwell.Journals do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Journals.{Entry, EntryImage, EntryVersion, Comment, Series}

  @free_version_limit 25

  # Entries

  def get_entry!(id), do: Repo.get!(Entry, id)
  def get_entry(id), do: Repo.get(Entry, id)

  @doc "Load multiple entries by IDs with their users preloaded."
  def get_entries_by_ids(ids) when is_list(ids) do
    if ids == [] do
      []
    else
      Entry
      |> where([e], e.id in ^ids)
      |> preload(:user)
      |> Repo.all()
    end
  end

  def get_entry_by_slug(user_id, slug) do
    Entry
    |> where(user_id: ^user_id, slug: ^slug)
    |> Repo.one()
  end

  def list_entries(user_id, opts \\ []) do
    privacy = Keyword.get(opts, :privacy)
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    tag = Keyword.get(opts, :tag)
    search = Keyword.get(opts, :search)
    category = Keyword.get(opts, :category)
    year = Keyword.get(opts, :year)
    sort = Keyword.get(opts, :sort, "newest")

    query =
      Entry
      |> where(user_id: ^user_id)
      |> where([e], e.status == :published)

    query =
      case sort do
        "oldest" -> order_by(query, asc: :published_at)
        _ -> order_by(query, desc: :published_at)
      end

    query =
      case privacy do
        list when is_list(list) -> where(query, [e], e.privacy in ^list)
        nil -> query
        p -> where(query, privacy: ^p)
      end

    query = if tag, do: where(query, [e], ^tag in e.tags), else: query
    query = if category, do: where(query, [e], e.category == ^category), else: query

    query =
      if search && search != "" do
        term = "%#{search}%"
        where(query, [e], ilike(e.title, ^term))
      else
        query
      end

    query =
      if year do
        year_int = if is_binary(year), do: String.to_integer(year), else: year
        start_dt = %DateTime{year: year_int, month: 1, day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 6}, time_zone: "Etc/UTC", zone_abbr: "UTC", utc_offset: 0, std_offset: 0}
        end_dt = %DateTime{year: year_int + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 6}, time_zone: "Etc/UTC", zone_abbr: "UTC", utc_offset: 0, std_offset: 0}
        where(query, [e], e.published_at >= ^start_dt and e.published_at < ^end_dt)
      else
        query
      end

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  @doc "Count entries matching filters (for pagination total)."
  def count_entries_filtered(user_id, opts \\ []) do
    privacy = Keyword.get(opts, :privacy)
    tag = Keyword.get(opts, :tag)
    search = Keyword.get(opts, :search)
    category = Keyword.get(opts, :category)
    year = Keyword.get(opts, :year)

    query =
      Entry
      |> where(user_id: ^user_id)
      |> where([e], e.status == :published)

    query =
      case privacy do
        list when is_list(list) -> where(query, [e], e.privacy in ^list)
        nil -> query
        p -> where(query, privacy: ^p)
      end

    query = if tag, do: where(query, [e], ^tag in e.tags), else: query
    query = if category, do: where(query, [e], e.category == ^category), else: query

    query =
      if search && search != "" do
        term = "%#{search}%"
        where(query, [e], ilike(e.title, ^term))
      else
        query
      end

    query =
      if year do
        year_int = if is_binary(year), do: String.to_integer(year), else: year
        start_dt = %DateTime{year: year_int, month: 1, day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 6}, time_zone: "Etc/UTC", zone_abbr: "UTC", utc_offset: 0, std_offset: 0}
        end_dt = %DateTime{year: year_int + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 6}, time_zone: "Etc/UTC", zone_abbr: "UTC", utc_offset: 0, std_offset: 0}
        where(query, [e], e.published_at >= ^start_dt and e.published_at < ^end_dt)
      else
        query
      end

    Repo.aggregate(query, :count)
  end

  def list_public_entries(user_id, opts \\ []) do
    opts
    |> Keyword.put(:privacy, :public)
    |> then(&list_entries(user_id, &1))
  end

  def list_feed_entries(user_id, friend_ids, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    # Get IDs of custom-privacy filters that include this user
    custom_filter_ids = get_filters_containing_user(user_id)

    Entry
    |> where([e], e.status == :published)
    |> where([e], not is_nil(e.published_at))
    |> where([e],
        # Own entries (any privacy except drafts)
        e.user_id == ^user_id or
        # Friends' public/friends-only entries
        (e.user_id in ^friend_ids and e.privacy in [:public, :friends_only]) or
        # Custom-privacy entries where viewer is in the filter
        (e.privacy == :custom and e.custom_filter_id in ^custom_filter_ids)
      )
    |> order_by(desc: :published_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload([:user, :user_icon])
    |> Repo.all()
  end

  defp get_filters_containing_user(user_id) do
    Inkwell.Social.FriendFilter
    |> where([f], ^user_id in f.member_ids)
    |> select([f], f.id)
    |> Repo.all()
  end

  def create_entry(attrs) do
    result =
      %Entry{}
      |> Entry.changeset(attrs)
      |> Repo.insert()

    # Fan out to federation if public
    case result do
      {:ok, entry} when entry.privacy == :public ->
        enqueue_fan_out(entry, "create")
        result

      _ ->
        result
    end
  end

  @doc """
  Create a published entry without federation fan-out.
  Used by the data import worker to avoid flooding followers with old posts.
  """
  def create_entry_quiet(attrs) do
    %Entry{}
    |> Entry.changeset(attrs)
    |> Repo.insert()
  end

  def update_entry(%Entry{} = entry, attrs, opts \\ []) do
    # Snapshot the pre-edit state before overwriting (published entries only)
    if entry.status == :published && entry.body_html != nil do
      create_version(entry)

      # Enforce version limit for free-tier users
      subscription_tier = Keyword.get(opts, :subscription_tier, "free")
      if subscription_tier != "plus" do
        cleanup_excess_versions(entry.id, @free_version_limit)
      end
    end

    result =
      entry
      |> Entry.changeset(attrs)
      |> Repo.update()

    case result do
      {:ok, updated} when updated.privacy == :public ->
        enqueue_fan_out(updated, "update")
        result

      _ ->
        result
    end
  end

  def delete_entry(%Entry{} = entry) do
    ap_id = entry.ap_id
    user_id = entry.user_id
    was_public = entry.privacy == :public

    result = Repo.delete(entry)

    # Fan out delete if the entry was public
    case result do
      {:ok, _} when was_public and not is_nil(ap_id) ->
        %{entry_ap_id: ap_id, action: "delete", user_id: user_id}
        |> Inkwell.Federation.Workers.FanOutWorker.new()
        |> Oban.insert()

        result

      _ ->
        result
    end
  end

  defp enqueue_fan_out(entry, action) do
    %{entry_id: entry.id, action: action, user_id: entry.user_id}
    |> Inkwell.Federation.Workers.FanOutWorker.new()
    |> Oban.insert()
  end

  # ── Drafts ─────────────────────────────────────────────────────────────────

  def create_draft(attrs) do
    %Entry{}
    |> Entry.draft_changeset(attrs)
    |> Repo.insert()
  end

  def update_draft(%Entry{status: :draft} = entry, attrs) do
    entry
    |> Entry.draft_changeset(attrs)
    |> Repo.update()
  end

  def publish_draft(%Entry{status: :draft} = entry, attrs) do
    result =
      entry
      |> Entry.publish_changeset(attrs)
      |> Repo.update()

    case result do
      {:ok, published} ->
        # Create version 1 — the first published snapshot
        create_version(published)

        if published.privacy == :public do
          enqueue_fan_out(published, "create")
        end

        result

      _ ->
        result
    end
  end

  def list_drafts(user_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    Entry
    |> where(user_id: ^user_id, status: :draft)
    |> order_by(desc: :updated_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def count_drafts(user_id) do
    Entry
    |> where(user_id: ^user_id, status: :draft)
    |> Repo.aggregate(:count)
  end

  def count_entries_using_filter(filter_id) do
    Entry
    |> where(custom_filter_id: ^filter_id)
    |> Repo.aggregate(:count)
  end

  # ── Series ───────────────────────────────────────────────────────────────────

  def list_series(user_id) do
    Series
    |> where(user_id: ^user_id)
    |> order_by(desc: :updated_at)
    |> Repo.all()
    |> Enum.map(fn series ->
      entry_count =
        Entry
        |> where(series_id: ^series.id, status: :published)
        |> Repo.aggregate(:count)

      Map.put(series, :entry_count, entry_count)
    end)
  end

  def get_series!(id), do: Repo.get!(Series, id)

  def get_series(id), do: Repo.get(Series, id)

  def get_series_by_slug(user_id, slug) do
    Series
    |> where(user_id: ^user_id, slug: ^slug)
    |> Repo.one()
  end

  def create_series(attrs) do
    %Series{}
    |> Series.changeset(attrs)
    |> Repo.insert()
  end

  def update_series(%Series{} = series, attrs) do
    series
    |> Series.changeset(attrs)
    |> Repo.update()
  end

  def delete_series(%Series{} = series) do
    Repo.delete(series)
  end

  def count_series(user_id) do
    Series
    |> where(user_id: ^user_id)
    |> Repo.aggregate(:count)
  end

  @doc "List published entries in a series, ordered by series_order. Applies privacy filtering for the viewer."
  def list_series_entries(series_id, viewer_id \\ nil) do
    query =
      Entry
      |> where(series_id: ^series_id, status: :published)
      |> where([e], not is_nil(e.published_at))
      |> order_by(:series_order)
      |> preload([:user, :user_icon])

    entries = Repo.all(query)

    # Apply privacy filtering
    Enum.filter(entries, fn entry ->
      cond do
        entry.privacy == :public -> true
        viewer_id == nil -> false
        entry.user_id == viewer_id -> true
        entry.privacy == :friends_only ->
          Inkwell.Social.is_friend?(entry.user_id, viewer_id)
        entry.privacy == :custom && entry.custom_filter_id != nil ->
          filter = Repo.get(Inkwell.Social.FriendFilter, entry.custom_filter_id)
          filter != nil && viewer_id in (filter.member_ids || [])
        entry.privacy == :private -> false
        true -> false
      end
    end)
  end

  @doc "Reorder entries within a series. entry_ids is the desired order."
  def reorder_series_entries(series_id, entry_ids) when is_list(entry_ids) do
    multi =
      entry_ids
      |> Enum.with_index(1)
      |> Enum.reduce(Ecto.Multi.new(), fn {entry_id, position}, multi ->
        Ecto.Multi.update_all(
          multi,
          {:reorder, entry_id},
          from(e in Entry, where: e.id == ^entry_id and e.series_id == ^series_id),
          set: [series_order: position]
        )
      end)

    case Repo.transaction(multi) do
      {:ok, _} -> :ok
      {:error, _, reason, _} -> {:error, reason}
    end
  end

  @doc "Get series navigation data (prev/next) for an entry in a series."
  def get_series_navigation(%Entry{series_id: nil}), do: nil

  def get_series_navigation(%Entry{series_id: series_id, series_order: order} = entry) do
    series = Repo.get(Series, series_id)
    if series == nil, do: throw(:no_series)

    # Count published entries in this series
    entry_count =
      Entry
      |> where(series_id: ^series_id, status: :published)
      |> Repo.aggregate(:count)

    # Find previous entry (highest series_order less than current)
    prev_entry =
      Entry
      |> where([e], e.series_id == ^series_id and e.status == :published)
      |> where([e], e.series_order < ^order)
      |> order_by(desc: :series_order)
      |> limit(1)
      |> preload(:user)
      |> Repo.one()

    # Find next entry (lowest series_order greater than current)
    next_entry =
      Entry
      |> where([e], e.series_id == ^series_id and e.status == :published)
      |> where([e], e.series_order > ^order)
      |> order_by(:series_order)
      |> limit(1)
      |> preload(:user)
      |> Repo.one()

    %{
      id: series.id,
      title: series.title,
      slug: series.slug,
      status: series.status,
      entry_count: entry_count,
      username: entry.user |> Map.get(:username, nil),
      prev_entry:
        if(prev_entry,
          do: %{slug: prev_entry.slug, title: prev_entry.title},
          else: nil
        ),
      next_entry:
        if(next_entry,
          do: %{slug: next_entry.slug, title: next_entry.title},
          else: nil
        )
    }
  catch
    :no_series -> nil
  end

  @doc "Batch-load series info for a list of entry IDs. Returns %{entry_id => series_info}."
  def get_series_for_entries(entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      %{}
    else
      Entry
      |> where([e], e.id in ^entry_ids and not is_nil(e.series_id))
      |> join(:inner, [e], s in Series, on: e.series_id == s.id)
      |> join(:inner, [e, s], u in Inkwell.Accounts.User, on: s.user_id == u.id)
      |> select([e, s, u], {e.id, %{id: s.id, title: s.title, slug: s.slug, username: u.username, series_order: e.series_order}})
      |> Repo.all()
      |> Map.new()
    end
  end

  @doc "Auto-assign the next series_order for an entry being added to a series."
  def next_series_order(series_id) do
    max_order =
      Entry
      |> where(series_id: ^series_id)
      |> where([e], not is_nil(e.series_order))
      |> Repo.aggregate(:max, :series_order)

    (max_order || 0) + 1
  end

  # ── Entry Versions ────────────────────────────────────────────────────────

  @doc "Snapshot the current state of an entry as a new version."
  def create_version(%Entry{} = entry) do
    next_num = next_version_number(entry.id)

    %EntryVersion{}
    |> EntryVersion.changeset(%{
      entry_id: entry.id,
      user_id: entry.user_id,
      version_number: next_num,
      title: entry.title,
      body_html: entry.body_html,
      body_raw: entry.body_raw,
      word_count: entry.word_count || 0,
      excerpt: entry.excerpt,
      mood: entry.mood,
      tags: entry.tags || [],
      category: if(entry.category, do: Atom.to_string(entry.category), else: nil),
      cover_image_id: entry.cover_image_id
    })
    |> Repo.insert()
  end

  defp next_version_number(entry_id) do
    max =
      EntryVersion
      |> where(entry_id: ^entry_id)
      |> Repo.aggregate(:max, :version_number)

    (max || 0) + 1
  end

  def list_versions(entry_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 50)

    EntryVersion
    |> where(entry_id: ^entry_id)
    |> order_by(desc: :version_number)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def get_version!(id), do: Repo.get!(EntryVersion, id)

  def get_version(id), do: Repo.get(EntryVersion, id)

  def count_versions(entry_id) do
    EntryVersion
    |> where(entry_id: ^entry_id)
    |> Repo.aggregate(:count)
  end

  @doc "Delete oldest versions for an entry, keeping only `max` most recent."
  def cleanup_excess_versions(entry_id, max) do
    # Get IDs of versions to keep (most recent `max`)
    keep_ids =
      EntryVersion
      |> where(entry_id: ^entry_id)
      |> order_by(desc: :version_number)
      |> limit(^max)
      |> select([v], v.id)
      |> Repo.all()

    if keep_ids == [] do
      {:ok, 0}
    else
      {count, _} =
        EntryVersion
        |> where(entry_id: ^entry_id)
        |> where([v], v.id not in ^keep_ids)
        |> Repo.delete_all()

      {:ok, count}
    end
  end

  # ── Public queries ─────────────────────────────────────────────────────────

  def list_public_explore_entries(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    tag = Keyword.get(opts, :tag)
    category = Keyword.get(opts, :category)

    query =
      Entry
      |> where([e], e.privacy == :public)
      |> where([e], e.status == :published)
      |> where([e], not is_nil(e.published_at))
      |> order_by(desc: :published_at)

    query = if tag, do: where(query, [e], ^tag in e.tags), else: query
    query = if category, do: where(query, [e], e.category == ^category), else: query

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload([:user, :user_icon])
    |> Repo.all()
  end

  def list_all_entries(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 50)

    Entry
    |> where([e], e.status == :published)
    |> order_by(desc: :inserted_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload([:user])
    |> Repo.all()
  end

  def count_entries(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> where([e], e.status == :published)
    |> Repo.aggregate(:count)
  end

  def count_public_entries(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> where([e], e.status == :published and e.privacy == :public)
    |> Repo.aggregate(:count)
  end

  @doc "List distinct years that a user has published entries, newest first."
  def list_entry_years(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> where([e], e.status == :published and not is_nil(e.published_at))
    |> select([e], fragment("DISTINCT EXTRACT(YEAR FROM ?)::integer", e.published_at))
    |> order_by([e], fragment("1 DESC"))
    |> Repo.all()
  end

  @doc "List all tags used by a user's published entries with frequency counts."
  def list_entry_tags(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> where([e], e.status == :published)
    |> where([e], fragment("array_length(?, 1) > 0", e.tags))
    |> select([e], e.tags)
    |> Repo.all()
    |> List.flatten()
    |> Enum.frequencies()
    |> Enum.sort_by(fn {_tag, count} -> -count end)
  end

  @doc "List all categories used by a user's published entries with counts."
  def list_entry_categories(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> where([e], e.status == :published and not is_nil(e.category))
    |> group_by([e], e.category)
    |> select([e], {e.category, count(e.id)})
    |> order_by([e], fragment("2 DESC"))
    |> Repo.all()
    |> Enum.map(fn {cat, count} -> %{category: cat, count: count} end)
  end

  # ── Entry Images ─────────────────────────────────────────────────────────

  @doc "Return the total stored byte_size for all entry images belonging to a user."
  def get_total_image_storage(user_id) do
    EntryImage
    |> where(user_id: ^user_id)
    |> Repo.aggregate(:sum, :byte_size)
    |> Kernel.||(0)
  end

  def create_entry_image(attrs) do
    %EntryImage{}
    |> EntryImage.changeset(attrs)
    |> Repo.insert()
  end

  def get_entry_image(id) do
    Repo.get(EntryImage, id)
  end

  @doc """
  Delete entry_images older than `age_hours` that are not referenced in any
  entry's body_html. Images are referenced via `/api/images/:id` URLs.
  """
  def cleanup_orphaned_images(age_hours \\ 24) do
    cutoff = DateTime.add(DateTime.utc_now(), -age_hours, :hour)

    # Get all image IDs referenced in any entry body_html
    entry_referenced =
      Entry
      |> where([e], not is_nil(e.body_html))
      |> select([e], e.body_html)
      |> Repo.all()
      |> Enum.flat_map(&extract_image_ids/1)
      |> MapSet.new()

    # Also protect cover images referenced by entries
    cover_image_referenced =
      Entry
      |> where([e], not is_nil(e.cover_image_id))
      |> select([e], e.cover_image_id)
      |> Repo.all()
      |> MapSet.new()

    # Also protect cover images referenced by series
    series_cover_referenced =
      Series
      |> where([s], not is_nil(s.cover_image_id))
      |> select([s], s.cover_image_id)
      |> Repo.all()
      |> MapSet.new()

    # Also protect images attached to feedback posts
    feedback_referenced =
      Inkwell.Feedback.FeedbackPost
      |> where([p], not is_nil(p.attachment_ids))
      |> select([p], p.attachment_ids)
      |> Repo.all()
      |> Enum.flat_map(fn ids -> ids || [] end)
      |> MapSet.new()

    referenced_ids =
      entry_referenced
      |> MapSet.union(cover_image_referenced)
      |> MapSet.union(series_cover_referenced)
      |> MapSet.union(feedback_referenced)

    # Get candidate orphan images (older than cutoff)
    candidates =
      EntryImage
      |> where([i], i.inserted_at < ^cutoff)
      |> select([i], i.id)
      |> Repo.all()

    orphan_ids = Enum.reject(candidates, &MapSet.member?(referenced_ids, &1))

    if orphan_ids == [] do
      {:ok, 0}
    else
      {count, _} =
        EntryImage
        |> where([i], i.id in ^orphan_ids)
        |> Repo.delete_all()

      {:ok, count}
    end
  end

  defp extract_image_ids(html) when is_binary(html) do
    Regex.scan(~r"/api/images/([0-9a-f-]{36})", html)
    |> Enum.map(fn [_, id] -> id end)
  end

  defp extract_image_ids(_), do: []

  @doc "Delete draft entries not updated in `days` days."
  def cleanup_abandoned_drafts(days \\ 365) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      Entry
      |> where([e], e.status == :draft and e.updated_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  # Comments

  def list_comments(entry_id) do
    Comment
    |> where(entry_id: ^entry_id)
    |> order_by(:inserted_at)
    |> preload([:user, :user_icon])
    |> Repo.all()
  end

  def create_comment(attrs) do
    %Comment{}
    |> Comment.changeset(attrs)
    |> Repo.insert()
    |> case do
      {:ok, comment} -> {:ok, Repo.preload(comment, [:user])}
      error -> error
    end
  end

  @comment_edit_window_hours 24

  @doc "Update a comment's body. Only allowed within 24 hours of creation."
  def update_comment(%Comment{} = comment, attrs) do
    deadline = DateTime.add(comment.inserted_at, @comment_edit_window_hours * 3600, :second)

    if DateTime.compare(DateTime.utc_now(), deadline) == :gt do
      {:error, :edit_window_expired}
    else
      comment
      |> Comment.edit_changeset(attrs)
      |> Repo.update()
      |> case do
        {:ok, comment} -> {:ok, Repo.preload(comment, [:user])}
        error -> error
      end
    end
  end

  def delete_comment(%Comment{} = comment) do
    Repo.delete(comment)
  end

  def count_comments(entry_id) do
    Comment
    |> where(entry_id: ^entry_id)
    |> Repo.aggregate(:count)
  end

  @doc "Batch-count comments for a list of entry IDs. Returns %{entry_id => count}."
  def count_comments_for_entries(entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      %{}
    else
      Comment
      |> where([c], c.entry_id in ^entry_ids)
      |> group_by([c], c.entry_id)
      |> select([c], {c.entry_id, count(c.id)})
      |> Repo.all()
      |> Map.new()
    end
  end

  @doc "Batch-count comments for a list of remote entry IDs. Returns %{remote_entry_id => count}."
  def count_comments_for_remote_entries(remote_entry_ids) when is_list(remote_entry_ids) do
    if remote_entry_ids == [] do
      %{}
    else
      Comment
      |> where([c], c.remote_entry_id in ^remote_entry_ids)
      |> group_by([c], c.remote_entry_id)
      |> select([c], {c.remote_entry_id, count(c.id)})
      |> Repo.all()
      |> Map.new()
    end
  end
end
