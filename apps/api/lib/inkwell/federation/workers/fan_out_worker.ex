defmodule Inkwell.Federation.Workers.FanOutWorker do
  @moduledoc """
  Oban worker that fans out a published entry to all followers' remote inboxes.
  Collects unique inboxes (preferring shared_inbox) and enqueues a
  DeliverActivityWorker for each.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 3,
    priority: 2

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Journals
  alias Inkwell.Accounts
  alias Inkwell.Social.Relationship
  alias Inkwell.Federation.{ActivityBuilder, RemoteActorSchema}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"entry_id" => entry_id, "action" => action, "user_id" => user_id}}) do
    entry = Journals.get_entry!(entry_id)
    user = Accounts.get_user!(user_id)
    activity = build_activity(action, entry, user)

    Logger.info("Fan-out #{action} for entry #{entry_id}")
    deliver_to_followers(activity, user)
  end

  # Handle delete where entry may already be gone
  def perform(%Oban.Job{args: %{"entry_ap_id" => entry_ap_id, "action" => "delete", "user_id" => user_id}}) do
    user = Accounts.get_user!(user_id)
    activity = ActivityBuilder.build_delete(entry_ap_id, user)

    Logger.info("Fan-out delete for #{entry_ap_id}")
    deliver_to_followers(activity, user)
  end

  # Handle announce/undo_announce for reprints of remote entries (by AP ID)
  def perform(%Oban.Job{args: %{"remote_entry_ap_id" => remote_entry_ap_id, "action" => action, "user_id" => user_id}})
      when action in ["announce_repost_remote", "undo_announce_repost_remote"] do
    user = Accounts.get_user!(user_id)

    activity =
      case action do
        "announce_repost_remote" -> ActivityBuilder.build_announce(remote_entry_ap_id, user)
        "undo_announce_repost_remote" -> ActivityBuilder.build_undo_announce(remote_entry_ap_id, user)
      end

    Logger.info("Fan-out #{action} for #{remote_entry_ap_id}")
    deliver_to_followers(activity, user)
  end

  # Handle announce/undo_announce by AP ID (used for inking remote entries)
  def perform(%Oban.Job{args: %{"entry_ap_id" => entry_ap_id, "action" => action, "user_id" => user_id}})
      when action in ["announce", "undo_announce"] do
    user = Accounts.get_user!(user_id)

    activity =
      case action do
        "announce" -> ActivityBuilder.build_announce(entry_ap_id, user)
        "undo_announce" -> ActivityBuilder.build_undo_announce(entry_ap_id, user)
      end

    Logger.info("Fan-out #{action} for #{entry_ap_id}")
    deliver_to_followers(activity, user)
  end

  # Stream inboxes in batches and enqueue delivery jobs — never holds
  # all inboxes in memory at once. Deduplicates via MapSet since
  # keyset pagination doesn't support DISTINCT across batches.
  defp deliver_to_followers(activity, user) do
    {count, _seen} =
      stream_remote_inboxes(user.id)
      |> Enum.reduce({0, MapSet.new()}, fn batch, {count, seen} ->
        Enum.reduce(batch, {count, seen}, fn %{inbox: inbox_url}, {c, s} ->
          if MapSet.member?(s, inbox_url) do
            {c, s}
          else
            %{activity: activity, inbox_url: inbox_url, user_id: user.id}
            |> DeliverActivityWorker.new()
            |> Oban.insert()

            {c + 1, MapSet.put(s, inbox_url)}
          end
        end)
      end)

    Logger.info("Fan-out enqueued #{count} delivery jobs for user #{user.id}")
    :ok
  end

  defp build_activity("create", entry, user), do: ActivityBuilder.build_create_note(entry, user)
  defp build_activity("update", entry, user), do: ActivityBuilder.build_update_note(entry, user)
  defp build_activity("delete", entry, user), do: ActivityBuilder.build_delete(entry.ap_id, user)
  defp build_activity("announce", entry, user), do: ActivityBuilder.build_announce(entry.ap_id, user)
  defp build_activity("undo_announce", entry, user), do: ActivityBuilder.build_undo_announce(entry.ap_id, user)
  defp build_activity("announce_repost", entry, user), do: ActivityBuilder.build_announce(entry.ap_id, user)
  defp build_activity("undo_announce_repost", entry, user), do: ActivityBuilder.build_undo_announce(entry.ap_id, user)

  @doc false
  def collect_remote_inboxes(user_id) do
    # Get unique remote inboxes (preferring shared_inbox) via SQL-level dedup
    # to avoid loading duplicate inbox maps into BEAM memory
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted)
    |> where([r], not is_nil(r.remote_actor_id))
    |> join(:inner, [r], ra in RemoteActorSchema, on: r.remote_actor_id == ra.id)
    |> select([r, ra], fragment("DISTINCT COALESCE(?, ?)", ra.shared_inbox, ra.inbox))
    |> Repo.all()
  end

  @doc """
  Stream remote inboxes in batches using keyset pagination.
  Each batch yields inbox URLs; caller should enqueue jobs per batch
  to avoid holding all inboxes in memory at once.
  """
  def stream_remote_inboxes(user_id, batch_size \\ 500) do
    Stream.unfold(nil, fn last_id ->
      query =
        Relationship
        |> where([r], r.following_id == ^user_id and r.status == :accepted)
        |> where([r], not is_nil(r.remote_actor_id))
        |> join(:inner, [r], ra in RemoteActorSchema, on: r.remote_actor_id == ra.id)
        |> select([r, ra], %{
          id: r.id,
          inbox: fragment("COALESCE(?, ?)", ra.shared_inbox, ra.inbox)
        })
        |> order_by([r], r.id)
        |> limit(^batch_size)

      query = if last_id, do: where(query, [r], r.id > ^last_id), else: query

      case Repo.all(query) do
        [] -> nil
        batch -> {batch, List.last(batch).id}
      end
    end)
  end
end
