defmodule Inkwell.Workers.SearchReindexWorker do
  @moduledoc """
  Oban worker for full batch reindexing of all entries and users in Meilisearch.

  Streams documents in batches of 500 to avoid memory pressure.
  Unique constraint prevents overlapping runs (5-minute period).
  """

  use Oban.Worker,
    queue: :search_indexing,
    max_attempts: 1,
    unique: [period: 300]

  alias Inkwell.{Accounts, Journals, Repo, Search}

  import Ecto.Query

  require Logger

  @batch_size 500

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    unless Search.configured?() do
      Logger.info("[SearchReindex] Meilisearch not configured, skipping")
      {:ok, :not_configured}
    else
      Logger.info("[SearchReindex] Starting full reindex...")

      entry_count = reindex_entries()
      user_count = reindex_users()

      Logger.info("[SearchReindex] Complete — indexed #{entry_count} entries, #{user_count} users")
      :ok
    end
  end

  defp reindex_entries do
    total =
      Journals.Entry
      |> where([e], e.status == :published)
      |> Repo.aggregate(:count, :id)

    Logger.info("[SearchReindex] Indexing #{total} entries...")

    Journals.Entry
    |> where([e], e.status == :published)
    |> order_by(:id)
    |> preload(:user)
    |> batch_stream(@batch_size)
    |> Enum.reduce(0, fn batch, acc ->
      # Filter out entries with nil users (deleted accounts in progress)
      valid = Enum.filter(batch, fn e -> e.user != nil end)
      if valid != [], do: Search.index_entries_batch(valid)
      count = acc + length(valid)
      if rem(count, 1000) < @batch_size do
        Logger.info("[SearchReindex] Entries: #{count}/#{total}")
      end
      count
    end)
  end

  defp reindex_users do
    total =
      Accounts.User
      |> where([u], is_nil(u.blocked_at))
      |> Repo.aggregate(:count, :id)

    Logger.info("[SearchReindex] Indexing #{total} users...")

    Accounts.User
    |> where([u], is_nil(u.blocked_at))
    |> order_by(:id)
    |> batch_stream(@batch_size)
    |> Enum.reduce(0, fn batch, acc ->
      Search.index_users_batch(batch)
      count = acc + length(batch)
      if rem(count, 1000) < @batch_size do
        Logger.info("[SearchReindex] Users: #{count}/#{total}")
      end
      count
    end)
  end

  # Simple batch streaming using LIMIT/OFFSET to avoid Repo.stream
  # (which requires a transaction and can hold connections)
  defp batch_stream(query, batch_size) do
    Stream.unfold(0, fn offset ->
      batch =
        query
        |> limit(^batch_size)
        |> offset(^offset)
        |> Repo.all()

      if batch == [] do
        nil
      else
        {batch, offset + batch_size}
      end
    end)
  end
end
