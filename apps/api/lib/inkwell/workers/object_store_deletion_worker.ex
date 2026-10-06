defmodule Inkwell.Workers.ObjectStoreDeletionWorker do
  @moduledoc """
  Deletes image files from object storage after their `entry_images` rows are
  gone. A database trigger queues each deleted row's `storage_key` in
  `object_store_deletions` (whatever deleted it: the orphan cleanup, an
  account deletion's cascade), and this drains that queue every 15 minutes.
  A key that fails stays queued for the next run.
  """

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 600]

  import Ecto.Query
  require Logger

  alias Inkwell.{ObjectStore, Repo}

  @batch 200

  @impl Oban.Worker
  def perform(_job) do
    if ObjectStore.configured?(), do: drain(), else: :ok
  end

  @doc "Deletes up to one batch of queued objects. Returns `%{deleted, failed}`."
  def drain do
    rows =
      from(d in "object_store_deletions", order_by: d.id, limit: @batch, select: {d.id, d.key})
      |> Repo.all()

    done =
      Enum.flat_map(rows, fn {id, key} ->
        case ObjectStore.delete(key) do
          :ok ->
            [id]

          {:error, reason} ->
            Logger.warning("[ObjectStore] Could not delete #{key}: #{inspect(reason)}")
            []
        end
      end)

    if done != [], do: from(d in "object_store_deletions", where: d.id in ^done) |> Repo.delete_all()

    result = %{deleted: length(done), failed: length(rows) - length(done)}
    if rows != [], do: Logger.info("[ObjectStore] Deleted #{result.deleted} object(s), #{result.failed} failed")
    result
  end
end
