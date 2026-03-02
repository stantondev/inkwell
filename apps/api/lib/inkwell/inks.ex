defmodule Inkwell.Inks do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Inks.Ink
  alias Inkwell.Journals.Entry

  @doc """
  Toggle ink on an entry: create if not exists, delete if exists.
  Atomically updates the denormalized ink_count on the entry.
  Returns {:ok, {:created, ink}} or {:ok, {:removed, nil}}.
  """
  def toggle_ink(user_id, entry_id) do
    case Repo.get_by(Ink, user_id: user_id, entry_id: entry_id) do
      nil ->
        Repo.transaction(fn ->
          case %Ink{} |> Ink.changeset(%{user_id: user_id, entry_id: entry_id}) |> Repo.insert() do
            {:ok, ink} ->
              Entry
              |> where(id: ^entry_id)
              |> Repo.update_all(inc: [ink_count: 1])

              {:created, ink}

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)

      existing ->
        Repo.transaction(fn ->
          Repo.delete!(existing)

          Entry
          |> where(id: ^entry_id)
          |> Repo.update_all(inc: [ink_count: -1])

          {:removed, nil}
        end)
    end
  end

  @doc "Check if a user has inked a specific entry."
  def has_inked?(user_id, entry_id) do
    Ink
    |> where(user_id: ^user_id, entry_id: ^entry_id)
    |> Repo.exists?()
  end

  @doc """
  Batch query: returns a MapSet of entry IDs the user has inked.
  Used by feed/explore controllers for efficient bulk lookups.
  """
  def get_user_inks_for_entries(user_id, entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      MapSet.new()
    else
      Ink
      |> where([i], i.user_id == ^user_id and i.entry_id in ^entry_ids)
      |> select([i], i.entry_id)
      |> Repo.all()
      |> MapSet.new()
    end
  end

  # ── Federated inks (inbound ActivityPub Like) ───────────────────────────

  @doc """
  Creates an ink from a remote (fediverse) actor on a local entry.
  Idempotent — returns {:ok, :existing} if the actor already inked this entry.
  Atomically increments ink_count.
  """
  def create_remote_ink(remote_actor_id, entry_id, ap_like_id) do
    case Repo.get_by(Ink, remote_actor_id: remote_actor_id, entry_id: entry_id) do
      nil ->
        Repo.transaction(fn ->
          attrs = %{remote_actor_id: remote_actor_id, entry_id: entry_id, ap_like_id: ap_like_id}

          case %Ink{} |> Ink.changeset(attrs) |> Repo.insert() do
            {:ok, ink} ->
              Entry
              |> where(id: ^entry_id)
              |> Repo.update_all(inc: [ink_count: 1])

              {:created, ink}

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)

      _existing ->
        {:ok, :existing}
    end
  end

  @doc """
  Removes a remote actor's ink from a local entry (for Undo { Like }).
  Returns {:ok, :removed} or {:ok, :not_found}.
  """
  def remove_remote_ink(remote_actor_id, entry_id) do
    case Repo.get_by(Ink, remote_actor_id: remote_actor_id, entry_id: entry_id) do
      nil ->
        {:ok, :not_found}

      ink ->
        Repo.transaction(fn ->
          Repo.delete!(ink)

          Entry
          |> where(id: ^entry_id)
          |> Repo.update_all(inc: [ink_count: -1])

          :removed
        end)
    end
  end

  @doc """
  Removes a remote ink by its AP Like ID (fallback for Undo matching).
  """
  def remove_remote_ink_by_ap_id(ap_like_id) when is_binary(ap_like_id) do
    case Repo.get_by(Ink, ap_like_id: ap_like_id) do
      nil ->
        {:ok, :not_found}

      ink ->
        entry_id = ink.entry_id

        Repo.transaction(fn ->
          Repo.delete!(ink)

          Entry
          |> where(id: ^entry_id)
          |> Repo.update_all(inc: [ink_count: -1])

          :removed
        end)
    end
  end

  # ── Trending ───────────────────────────────────────────────────────────

  @doc """
  Trending entries: most inked public entries in the last N days.
  Returns entries with users preloaded, ordered by ink_count DESC.
  """
  def list_trending_entries(opts \\ []) do
    days = Keyword.get(opts, :days, 7)
    min_inks = Keyword.get(opts, :min_inks, 2)
    limit = Keyword.get(opts, :limit, 8)
    exclude_user_ids = Keyword.get(opts, :exclude_user_ids, [])

    since = DateTime.utc_now() |> DateTime.add(-days * 86400, :second)

    query =
      Entry
      |> where([e], e.status == :published and e.privacy == :public)
      |> where([e], e.ink_count >= ^min_inks)
      |> where([e], e.published_at >= ^since)
      |> where([e], e.sensitive == false and e.admin_sensitive == false)
      |> order_by([e], [desc: e.ink_count, desc: e.published_at])
      |> limit(^limit)

    query =
      if exclude_user_ids != [] do
        where(query, [e], e.user_id not in ^exclude_user_ids)
      else
        query
      end

    query
    |> preload([:user, :user_icon])
    |> Repo.all()
  end
end
