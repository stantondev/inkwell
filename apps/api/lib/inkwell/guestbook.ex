defmodule Inkwell.Guestbook do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Guestbook.GuestbookEntry
  alias Inkwell.Accounts

  @doc "List guestbook entries for a profile, newest first."
  def list_entries(profile_user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)

    GuestbookEntry
    |> where(profile_user_id: ^profile_user_id)
    |> order_by([e], desc: e.inserted_at)
    |> limit(^limit)
    |> offset(^offset)
    |> preload(:author)
    |> Repo.all()
  end

  @doc "Count guestbook entries for a profile."
  def count_entries(profile_user_id) do
    GuestbookEntry
    |> where(profile_user_id: ^profile_user_id)
    |> Repo.aggregate(:count)
  end

  @doc "Create a guestbook entry."
  def create_entry(attrs) do
    %GuestbookEntry{}
    |> GuestbookEntry.changeset(attrs)
    |> Repo.insert()
  end

  @doc "Delete a guestbook entry. Only the author or the profile owner can delete."
  def delete_entry(entry_id, user_id) do
    case Repo.get(GuestbookEntry, entry_id) do
      nil ->
        {:error, :not_found}

      entry ->
        if entry.author_id == user_id or entry.profile_user_id == user_id do
          Repo.delete(entry)
        else
          {:error, :forbidden}
        end
    end
  end

  @doc "Get the profile user by username."
  def get_profile_user(username) do
    Accounts.get_user_by_username(username)
  end
end
