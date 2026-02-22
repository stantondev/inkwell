defmodule Inkwell.Journals do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Journals.{Entry, Comment}

  # Entries

  def get_entry!(id), do: Repo.get!(Entry, id)

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

    query =
      Entry
      |> where(user_id: ^user_id)
      |> order_by(desc: :published_at)

    query = if privacy, do: where(query, privacy: ^privacy), else: query
    query = if tag, do: where(query, [e], ^tag in e.tags), else: query

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def list_public_entries(user_id, opts \\ []) do
    opts
    |> Keyword.put(:privacy, :public)
    |> then(&list_entries(user_id, &1))
  end

  def list_feed_entries(user_id, friend_ids, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    Entry
    |> where([e], not is_nil(e.published_at))
    |> where([e],
        # Own entries (any privacy except drafts) OR friends' public/friends-only entries
        e.user_id == ^user_id or
        (e.user_id in ^friend_ids and e.privacy in [:public, :friends_only])
      )
    |> order_by(desc: :published_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload([:user, :user_icon])
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

  def update_entry(%Entry{} = entry, attrs) do
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

  def list_public_explore_entries(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    tag = Keyword.get(opts, :tag)

    query =
      Entry
      |> where([e], e.privacy == :public)
      |> where([e], not is_nil(e.published_at))
      |> order_by(desc: :published_at)

    query = if tag, do: where(query, [e], ^tag in e.tags), else: query

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
    |> order_by(desc: :inserted_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload([:user])
    |> Repo.all()
  end

  def count_entries(user_id) do
    Entry
    |> where(user_id: ^user_id)
    |> Repo.aggregate(:count)
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
  end

  def delete_comment(%Comment{} = comment) do
    Repo.delete(comment)
  end

  def count_comments(entry_id) do
    Comment
    |> where(entry_id: ^entry_id)
    |> Repo.aggregate(:count)
  end
end
