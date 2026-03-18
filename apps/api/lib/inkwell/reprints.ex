defmodule Inkwell.Reprints do
  @moduledoc """
  Context for managing reprints (reposts/boosts).
  Reprints are public timeline actions — when a user reprints an entry,
  it appears in their followers' feeds with attribution.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Reprints.Reprint
  alias Inkwell.Journals.Entry
  alias Inkwell.Federation.RemoteEntry

  # ── Local user reprinting a local entry ──────────────────────────────

  @doc """
  Toggle reprint on a local entry: create if not exists, delete if exists.
  Atomically updates the denormalized reprint_count on the entry.
  Returns {:ok, {:created, reprint}} or {:ok, {:removed, nil}}.
  """
  def toggle_reprint(user_id, entry_id) do
    result =
      case Repo.get_by(Reprint, user_id: user_id, entry_id: entry_id) do
        nil ->
          Repo.transaction(fn ->
            case %Reprint{} |> Reprint.changeset(%{user_id: user_id, entry_id: entry_id}) |> Repo.insert() do
              {:ok, reprint} ->
                Entry
                |> where(id: ^entry_id)
                |> Repo.update_all(inc: [reprint_count: 1])

                {:created, reprint}

              {:error, changeset} ->
                Repo.rollback(changeset)
            end
          end)

        existing ->
          Repo.transaction(fn ->
            Repo.delete!(existing)

            Entry
            |> where(id: ^entry_id)
            |> Repo.update_all(inc: [reprint_count: -1])

            {:removed, nil}
          end)
      end

    # Re-index entry for updated reprint_count
    case result do
      {:ok, _} -> enqueue_search_index_entry(entry_id)
      _ -> :ok
    end

    result
  end

  # ── Local user reprinting a remote entry ─────────────────────────────

  @doc """
  Toggle reprint on a remote (fediverse) entry.
  Atomically updates reprint_count on remote_entries.
  Returns {:ok, {:created, reprint}} or {:ok, {:removed, nil}}.
  """
  def toggle_reprint_remote(user_id, remote_entry_id) do
    case Repo.get_by(Reprint, user_id: user_id, remote_entry_id: remote_entry_id) do
      nil ->
        Repo.transaction(fn ->
          case %Reprint{} |> Reprint.changeset(%{user_id: user_id, remote_entry_id: remote_entry_id}) |> Repo.insert() do
            {:ok, reprint} ->
              RemoteEntry
              |> where(id: ^remote_entry_id)
              |> Repo.update_all(inc: [reprint_count: 1])

              {:created, reprint}

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)

      existing ->
        Repo.transaction(fn ->
          Repo.delete!(existing)

          RemoteEntry
          |> where(id: ^remote_entry_id)
          |> Repo.update_all(inc: [reprint_count: -1])

          {:removed, nil}
        end)
    end
  end

  # ── Query helpers ────────────────────────────────────────────────────

  @doc "Check if a user has reprinted a specific local entry."
  def has_reprinted?(user_id, entry_id) do
    Reprint
    |> where(user_id: ^user_id, entry_id: ^entry_id)
    |> Repo.exists?()
  end

  @doc """
  Batch query: returns a MapSet of local entry IDs the user has reprinted.
  Used by feed/explore controllers for efficient bulk lookups.
  """
  def get_user_reprints_for_entries(user_id, entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      MapSet.new()
    else
      Reprint
      |> where([r], r.user_id == ^user_id and r.entry_id in ^entry_ids)
      |> select([r], r.entry_id)
      |> Repo.all()
      |> MapSet.new()
    end
  end

  @doc """
  Batch query: returns a MapSet of remote entry IDs the user has reprinted.
  """
  def get_user_reprints_for_remote_entries(user_id, remote_entry_ids) when is_list(remote_entry_ids) do
    if remote_entry_ids == [] do
      MapSet.new()
    else
      Reprint
      |> where([r], r.user_id == ^user_id and r.remote_entry_id in ^remote_entry_ids)
      |> select([r], r.remote_entry_id)
      |> Repo.all()
      |> MapSet.new()
    end
  end

  @doc """
  Batch query: returns a map of remote_entry_id => reprint count.
  """
  def count_reprints_for_remote_entries(remote_entry_ids) when is_list(remote_entry_ids) do
    if remote_entry_ids == [] do
      %{}
    else
      Reprint
      |> where([r], r.remote_entry_id in ^remote_entry_ids)
      |> group_by([r], r.remote_entry_id)
      |> select([r], {r.remote_entry_id, count(r.id)})
      |> Repo.all()
      |> Map.new()
    end
  end

  # ── Feed reprints (reprinted entries from followed users) ────────────

  @doc """
  Returns reprints made by followed users, for display in the feed timeline.
  Each result includes the original entry data + reprinter info.
  Only returns reprints of public, published local entries.
  Excludes entries by blocked users and the viewer's own entries.
  """
  def list_feed_reprints(user_id, followed_user_ids, opts \\ []) do
    exclude_user_ids = Keyword.get(opts, :exclude_user_ids, [])
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)

    query =
      Reprint
      |> where([r], r.user_id in ^followed_user_ids)
      |> where([r], not is_nil(r.entry_id))
      |> join(:inner, [r], e in Entry, on: r.entry_id == e.id)
      |> where([r, e], e.status == :published and e.privacy == :public)
      |> where([r, e], e.sensitive == false and e.admin_sensitive == false)
      |> join(:inner, [r, e], u in Inkwell.Accounts.User, on: r.user_id == u.id)
      |> join(:inner, [r, e, u], author in Inkwell.Accounts.User, on: e.user_id == author.id)
      |> order_by([r], desc: r.inserted_at)
      |> limit(^limit)
      |> offset(^offset)

    # Exclude reprinter's own entries (you'd already see them in your feed)
    query = where(query, [r, e], e.user_id != ^user_id)

    # Exclude blocked user entries
    query =
      if exclude_user_ids != [] do
        query
        |> where([r, e], e.user_id not in ^exclude_user_ids)
        |> where([r], r.user_id not in ^exclude_user_ids)
      else
        query
      end

    query
    |> select([r, e, reprinter, author], %{
      reprint_id: r.id,
      reprinted_at: r.inserted_at,
      entry_id: e.id,
      reprinter: %{
        id: reprinter.id,
        username: reprinter.username,
        display_name: reprinter.display_name,
        avatar_url: reprinter.avatar_url,
        avatar_frame: reprinter.avatar_frame,
        subscription_tier: reprinter.subscription_tier
      },
      author: %{
        id: author.id,
        username: author.username,
        display_name: author.display_name,
        avatar_url: author.avatar_url,
        avatar_frame: author.avatar_frame,
        subscription_tier: author.subscription_tier
      }
    })
    |> Repo.all()
  end

  # ── Federated reprints (inbound ActivityPub Announce) ────────────────

  @doc """
  Creates a reprint from a remote (fediverse) actor on a local entry.
  Idempotent — returns {:ok, :existing} if the actor already reprinted.
  Atomically increments reprint_count.
  """
  def create_remote_reprint(remote_actor_id, entry_id, ap_announce_id \\ nil) do
    case Repo.get_by(Reprint, remote_actor_id: remote_actor_id, entry_id: entry_id) do
      nil ->
        Repo.transaction(fn ->
          attrs = %{remote_actor_id: remote_actor_id, entry_id: entry_id, ap_announce_id: ap_announce_id}

          case %Reprint{} |> Reprint.changeset(attrs) |> Repo.insert() do
            {:ok, reprint} ->
              Entry
              |> where(id: ^entry_id)
              |> Repo.update_all(inc: [reprint_count: 1])

              {:created, reprint}

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)

      _existing ->
        {:ok, :existing}
    end
  end

  @doc """
  Removes a remote actor's reprint from a local entry (for Undo { Announce }).
  Returns {:ok, :removed} or {:ok, :not_found}.
  """
  def remove_remote_reprint(remote_actor_id, entry_id) do
    case Repo.get_by(Reprint, remote_actor_id: remote_actor_id, entry_id: entry_id) do
      nil ->
        {:ok, :not_found}

      reprint ->
        Repo.transaction(fn ->
          Repo.delete!(reprint)

          Entry
          |> where(id: ^entry_id)
          |> Repo.update_all(inc: [reprint_count: -1])

          :removed
        end)
    end
  end

  @doc """
  Removes a remote reprint by its AP Announce ID (fallback for Undo matching).
  """
  def remove_remote_reprint_by_ap_id(ap_announce_id) when is_binary(ap_announce_id) do
    case Repo.get_by(Reprint, ap_announce_id: ap_announce_id) do
      nil ->
        {:ok, :not_found}

      reprint ->
        entry_id = reprint.entry_id

        Repo.transaction(fn ->
          Repo.delete!(reprint)

          if entry_id do
            Entry
            |> where(id: ^entry_id)
            |> Repo.update_all(inc: [reprint_count: -1])
          end

          :removed
        end)
    end
  end

  # ── Search indexing helper ───────────────────────────────────────────

  defp enqueue_search_index_entry(entry_id) do
    %{action: "index_entry", entry_id: entry_id}
    |> Inkwell.Workers.SearchIndexWorker.new()
    |> Oban.insert()
  end
end
