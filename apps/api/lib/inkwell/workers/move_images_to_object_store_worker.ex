defmodule Inkwell.Workers.MoveImagesToObjectStoreWorker do
  @moduledoc """
  Copies images kept in Postgres to object storage, 25 at a time, checking
  each copy (Inkwell.Images.move_to_object_store/1). Queues itself again
  while any remain, so starting it once moves everything:

      Oban.insert(Inkwell.Workers.MoveImagesToObjectStoreWorker.new(%{}))

  Also runs daily, to pick up uploads that fell back to Postgres while the
  bucket couldn't be reached. Stops after a batch where nothing moved, so a
  bucket outage can't make it loop.

  Once a run has nothing left to move it also clears the Postgres copy of
  any image that has been safely in the bucket for 14 days
  (`Images.drop_database_copies/1`, which checks each object first). The
  one-off clear-out of the copies made during the move happened by hand on
  2026-10-23; this keeps fallback uploads from slowly filling the database
  again.
  """

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 30, states: [:available, :scheduled]]

  require Logger

  alias Inkwell.{Images, ObjectStore}

  @keep_database_copy_days 14

  @impl Oban.Worker
  def perform(_job) do
    if ObjectStore.configured?() do
      %{moved: moved, failed: failed, remaining: remaining} = Images.move_to_object_store(25)

      if moved + failed > 0 do
        Logger.info("[Images] Moved #{moved} image(s) to object storage, #{failed} failed, #{remaining} left")
      end

      if moved > 0 and remaining > 0 do
        %{} |> new(schedule_in: 2) |> Oban.insert()
      else
        clear_old_database_copies()
      end
    end

    :ok
  end

  defp clear_old_database_copies do
    case Images.drop_database_copies(@keep_database_copy_days) do
      %{cleared: 0, kept: 0} ->
        :ok

      %{cleared: cleared, kept: kept} ->
        Logger.info("[Images] Cleared #{cleared} Postgres image copies already in object storage, kept #{kept}")
    end
  end
end
