defmodule Inkwell.Workers.PublishScheduledEntriesWorker do
  @moduledoc """
  Every minute, publishes scheduled drafts whose time has come, with the same
  side effects as publishing by hand (`InkwellWeb.EntryPublishing`), using the
  newsletter and cross-post choices saved when the post was scheduled.

  The entry's date is its scheduled time. A post that can't be published (it
  was emptied after scheduling, or its author is suspended) is taken off the
  schedule and left as a draft rather than retried every minute.
  """
  use Oban.Worker, queue: :default, max_attempts: 1, unique: [period: 50]

  require Logger

  alias Inkwell.{Accounts, Journals}
  alias InkwellWeb.EntryPublishing

  @impl Oban.Worker
  def perform(_job) do
    Journals.list_due_scheduled_entries()
    |> Enum.each(&publish/1)

    :ok
  end

  defp publish(entry) do
    user = Accounts.get_user!(entry.user_id)
    options = entry.scheduled_options || %{}

    attrs =
      %{"published_at" => entry.scheduled_at}
      |> maybe_series_order(entry)

    with nil <- user.blocked_at,
         {:ok, published} <- Journals.publish_draft(entry, attrs) do
      EntryPublishing.after_publish(published, user, options)
      Logger.info("Published scheduled entry #{entry.id} for @#{user.username}")
    else
      reason ->
        Logger.warning("Couldn't publish scheduled entry #{entry.id}: #{inspect(reason)}; unscheduling")
        Journals.unschedule_entry(entry)
    end
  rescue
    e ->
      Logger.error("Scheduled publish of #{entry.id} crashed: #{Exception.message(e)}")
      Journals.unschedule_entry(entry)
  end

  # Same as publishing by hand: an entry in a series goes to the end of it.
  defp maybe_series_order(attrs, %{series_id: nil}), do: attrs
  defp maybe_series_order(attrs, %{series_order: order}) when not is_nil(order), do: attrs

  defp maybe_series_order(attrs, %{series_id: series_id}),
    do: Map.put(attrs, "series_order", Journals.next_series_order(series_id))
end
