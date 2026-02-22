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
    inboxes = collect_remote_inboxes(user.id)

    Logger.info("Fan-out #{action} for entry #{entry_id}: #{length(inboxes)} remote inboxes")

    Enum.each(inboxes, fn inbox_url ->
      %{activity: activity, inbox_url: inbox_url, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end)

    :ok
  end

  # Handle delete where entry may already be gone
  def perform(%Oban.Job{args: %{"entry_ap_id" => entry_ap_id, "action" => "delete", "user_id" => user_id}}) do
    user = Accounts.get_user!(user_id)
    activity = ActivityBuilder.build_delete(entry_ap_id, user)
    inboxes = collect_remote_inboxes(user.id)

    Logger.info("Fan-out delete for #{entry_ap_id}: #{length(inboxes)} remote inboxes")

    Enum.each(inboxes, fn inbox_url ->
      %{activity: activity, inbox_url: inbox_url, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end)

    :ok
  end

  defp build_activity("create", entry, user), do: ActivityBuilder.build_create_note(entry, user)
  defp build_activity("update", entry, user), do: ActivityBuilder.build_update_note(entry, user)
  defp build_activity("delete", entry, user), do: ActivityBuilder.build_delete(entry.ap_id, user)

  @doc false
  def collect_remote_inboxes(user_id) do
    # Get remote actors that follow this user via the Relationship schema
    # Use a proper Ecto join through the schema for correct enum handling
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted)
    |> where([r], not is_nil(r.remote_actor_id))
    |> join(:inner, [r], ra in RemoteActorSchema, on: r.remote_actor_id == ra.id)
    |> select([r, ra], %{inbox: ra.inbox, shared_inbox: ra.shared_inbox})
    |> Repo.all()
    |> Enum.map(fn %{inbox: inbox, shared_inbox: shared_inbox} ->
      # Prefer shared inbox to reduce number of requests
      shared_inbox || inbox
    end)
    |> Enum.uniq()
  end
end
