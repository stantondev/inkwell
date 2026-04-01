defmodule Inkwell.Workers.WebhookProcessingWorker do
  @moduledoc """
  Reliable webhook processing via Oban.
  Replaces fire-and-forget Task.start for Square webhook events.
  Includes idempotency check to prevent duplicate processing.
  """

  use Oban.Worker, queue: :default, max_attempts: 5

  alias Inkwell.Billing

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"event" => event}}) do
    event_id = event["event_id"] || event["id"] || generate_fallback_id(event)
    event_type = event["type"] || "unknown"

    if Billing.already_processed?(event_id) do
      Logger.info("Skipping duplicate webhook event: #{event_id}")
      :ok
    else
      case Billing.handle_webhook_event(event) do
        :ok ->
          Billing.record_event(event_id, event_type, "processed")
          :ok

        :error ->
          Billing.record_event(event_id, event_type, "failed")
          {:error, "webhook processing failed for event #{event_id}"}
      end
    end
  end

  defp generate_fallback_id(event) do
    :crypto.hash(:sha256, Jason.encode!(event))
    |> Base.encode16(case: :lower)
    |> binary_part(0, 32)
  end
end
