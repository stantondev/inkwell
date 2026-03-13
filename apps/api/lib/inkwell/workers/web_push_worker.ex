defmodule Inkwell.Workers.WebPushWorker do
  @moduledoc """
  Oban worker that delivers a single web push notification to a subscription.
  One job per subscription (fan-out from Push.deliver/2).
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Push
  alias Inkwell.Push.PushSubscription
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"subscription_id" => sub_id, "payload" => payload}}) do
    case Repo.get(PushSubscription, sub_id) do
      nil ->
        Logger.debug("[WebPush] Subscription #{sub_id} not found, skipping")
        :ok

      sub ->
        send_push(sub, payload)
    end
  end

  defp send_push(sub, payload) do
    if is_nil(Application.get_env(:web_push_encryption, :vapid_details)) do
      Logger.warning("[WebPush] VAPID not configured, skipping push")
      :ok
    else
      subscription = %{
        endpoint: sub.endpoint,
        keys: %{
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }

      json_payload = Jason.encode!(payload)

      case WebPushEncryption.send_web_push(json_payload, subscription) do
        {:ok, %{status_code: code}} when code in 200..201 ->
          Logger.debug("[WebPush] Delivered to #{sub.endpoint}")
          :ok

        {:ok, %{status_code: code}} when code in [404, 410] ->
          Logger.info("[WebPush] Subscription gone (#{code}), deleting #{sub.endpoint}")
          Push.delete_by_endpoint(sub.endpoint)
          :ok

        {:ok, %{status_code: 429}} ->
          Logger.warning("[WebPush] Rate limited for #{sub.endpoint}")
          {:error, :rate_limited}

        {:ok, %{status_code: code}} when code >= 500 ->
          Logger.warning("[WebPush] Server error #{code} for #{sub.endpoint}")
          {:error, "server_error_#{code}"}

        {:ok, %{status_code: code}} ->
          Logger.warning("[WebPush] Unexpected #{code} for #{sub.endpoint}, treating as permanent failure")
          :ok

        {:error, reason} ->
          Logger.warning("[WebPush] Send failed: #{inspect(reason)}")
          {:error, reason}
      end
    end
  end
end
