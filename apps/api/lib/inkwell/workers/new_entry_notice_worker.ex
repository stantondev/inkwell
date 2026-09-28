defmodule Inkwell.Workers.NewEntryNoticeWorker do
  @moduledoc "Sends `Inkwell.NewEntryNotices` for a newly published entry, off the request."

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 3600, keys: [:entry_id]]

  @impl true
  def perform(%Oban.Job{args: %{"entry_id" => entry_id}}) do
    case Inkwell.Journals.get_entry(entry_id) do
      %Inkwell.Journals.Entry{} = entry -> Inkwell.NewEntryNotices.notify_followers(entry)
      _ -> :ok
    end
  end
end
