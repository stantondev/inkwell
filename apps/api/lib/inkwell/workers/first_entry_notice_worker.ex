defmodule Inkwell.Workers.FirstEntryNoticeWorker do
  @moduledoc "Sends `Inkwell.FirstEntryNotices` for a new writer's first entry, a little after it's published."

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 86_400, keys: [:entry_id]]

  @impl true
  def perform(%Oban.Job{args: %{"entry_id" => entry_id}}), do: Inkwell.FirstEntryNotices.notify(entry_id)
end
