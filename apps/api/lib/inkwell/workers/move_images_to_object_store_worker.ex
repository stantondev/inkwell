defmodule Inkwell.Workers.MoveImagesToObjectStoreWorker do
  @moduledoc """
  Copies images kept in Postgres to object storage, 25 at a time, checking
  each copy (Inkwell.Images.move_to_object_store/1). Queues itself again
  while any remain, so starting it once moves everything:

      Oban.insert(Inkwell.Workers.MoveImagesToObjectStoreWorker.new(%{}))

  Also runs daily, to pick up uploads that fell back to Postgres while the
  bucket couldn't be reached. Stops after a batch where nothing moved, so a
  bucket outage can't make it loop.
  """

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 30, states: [:available, :scheduled]]

  require Logger

  alias Inkwell.{Images, ObjectStore}

  @impl Oban.Worker
  def perform(_job) do
    if ObjectStore.configured?() do
      %{moved: moved, failed: failed, remaining: remaining} = Images.move_to_object_store(25)

      if moved + failed > 0 do
        Logger.info("[Images] Moved #{moved} image(s) to object storage, #{failed} failed, #{remaining} left")
      end

      if moved > 0 and remaining > 0 do
        %{} |> new(schedule_in: 2) |> Oban.insert()
      end
    end

    :ok
  end
end
