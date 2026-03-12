defmodule Inkwell.Workers.SearchIndexWorker do
  @moduledoc """
  Oban worker for indexing individual documents in Meilisearch.

  Runs on the `search_indexing` queue (concurrency 5).
  No-op when Meilisearch is not configured.
  """

  use Oban.Worker, queue: :search_indexing, max_attempts: 3

  alias Inkwell.{Accounts, Journals, Repo, Search}

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    if Search.configured?() do
      handle(args)
    else
      :ok
    end
  end

  defp handle(%{"action" => "index_entry", "entry_id" => entry_id}) do
    case Repo.get(Journals.Entry, entry_id) do
      nil ->
        Logger.debug("[SearchIndex] Entry #{entry_id} not found, skipping")
        :ok

      entry ->
        entry = Repo.preload(entry, :user)
        Search.index_entry(entry)
        :ok
    end
  end

  defp handle(%{"action" => "index_user", "user_id" => user_id}) do
    case Repo.get(Accounts.User, user_id) do
      nil ->
        Logger.debug("[SearchIndex] User #{user_id} not found, skipping")
        :ok

      user ->
        Search.index_user(user)
        :ok
    end
  end

  defp handle(%{"action" => "delete_entry", "entry_id" => entry_id}) do
    Search.delete_entry(entry_id)
    :ok
  end

  defp handle(%{"action" => "delete_user", "user_id" => user_id}) do
    Search.delete_user(user_id)
    :ok
  end

  defp handle(%{"action" => "delete_user_entries", "user_id" => user_id}) do
    Search.delete_entries_by_user(user_id)
    :ok
  end

  defp handle(%{"action" => "reindex_user_entries", "user_id" => user_id}) do
    import Ecto.Query

    Journals.Entry
    |> where([e], e.user_id == ^user_id and e.status == :published)
    |> preload(:user)
    |> Repo.all()
    |> case do
      [] -> :ok
      entries ->
        Search.index_entries_batch(entries)
        :ok
    end
  end

  defp handle(args) do
    Logger.warning("[SearchIndex] Unknown action: #{inspect(args)}")
    :ok
  end
end
