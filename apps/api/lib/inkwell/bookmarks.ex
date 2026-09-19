defmodule Inkwell.Bookmarks do
  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Bookmarks.Bookmark
  alias Inkwell.Journals.Entry
  alias Inkwell.Accounts.User
  alias Inkwell.Social.{Relationship, FriendFilter}

  @doc """
  Bookmark an entry. Idempotent — returns {:ok, bookmark} if already bookmarked.
  """
  def bookmark_entry(user_id, entry_id) do
    case Repo.get_by(Bookmark, user_id: user_id, entry_id: entry_id) do
      nil ->
        %Bookmark{}
        |> Bookmark.changeset(%{user_id: user_id, entry_id: entry_id})
        |> Repo.insert()

      existing ->
        {:ok, existing}
    end
  end

  @doc """
  Remove a bookmark. Returns :ok even if it didn't exist.
  """
  def remove_bookmark(user_id, entry_id) do
    case Repo.get_by(Bookmark, user_id: user_id, entry_id: entry_id) do
      nil -> :ok
      bookmark ->
        Repo.delete(bookmark)
        :ok
    end
  end

  @doc """
  Returns the bookmark record if the user has bookmarked this entry, else nil.
  """
  def get_user_bookmark(user_id, entry_id) do
    Repo.get_by(Bookmark, user_id: user_id, entry_id: entry_id)
  end

  @doc """
  Batch query: returns a MapSet of entry IDs that the user has bookmarked.
  Used by feed/explore controllers to add `bookmarked: bool` per entry efficiently.
  """
  def get_bookmarks_for_entries(user_id, entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      MapSet.new()
    else
      Bookmark
      |> where([b], b.user_id == ^user_id and b.entry_id in ^entry_ids)
      |> select([b], b.entry_id)
      |> Repo.all()
      |> MapSet.new()
    end
  end

  @doc """
  List a user's bookmarked entries, most recently saved first.
  Returns a list of {entry, author, saved_at} tuples.
  """
  def list_user_bookmarks(user_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    offset = (page - 1) * per_page

    # Same visibility as the entry page. This used to return every bookmarked
    # published entry with its full body, so a bookmark kept showing an entry
    # after the author made it private or blocked the reader, and anyone could
    # bookmark an entry id to read a private entry.
    from(b in Bookmark,
      join: e in Entry, as: :entry, on: e.id == b.entry_id,
      join: u in User, on: u.id == e.user_id,
      where: b.user_id == ^user_id,
      where: e.status == :published and is_nil(u.blocked_at),
      where:
        e.user_id == ^user_id or
          e.privacy == :public or
          (e.privacy == :friends_only and
             exists(
               from(r in Relationship,
                 where:
                   r.follower_id == ^user_id and r.following_id == parent_as(:entry).user_id and
                     r.status == :accepted
               )
             )) or
          (e.privacy == :custom and
             exists(
               from(f in FriendFilter,
                 where:
                   f.id == parent_as(:entry).custom_filter_id and
                     fragment("? = ANY(?)", type(^user_id, :binary_id), f.member_ids)
               )
             )),
      where:
        not exists(
          from(r in Relationship,
            where:
              r.status == :blocked and
                ((r.follower_id == ^user_id and r.following_id == parent_as(:entry).user_id) or
                   (r.following_id == ^user_id and r.follower_id == parent_as(:entry).user_id))
          )
        ),
      order_by: [desc: b.inserted_at],
      limit: ^per_page,
      offset: ^offset,
      select: {e, u, b.inserted_at}
    )
    |> Repo.all()
  end
end
