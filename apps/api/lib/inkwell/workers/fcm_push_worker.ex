defmodule Inkwell.Workers.FcmPushWorker do
  @moduledoc "Delivers one notification to one phone running the Inkwell app (Push.deliver_to_devices/2)."

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(1)

  alias Inkwell.Push
  alias Inkwell.Push.{Device, Fcm}
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"device_id" => id, "payload" => payload}}) do
    case Repo.get(Device, id) do
      nil ->
        :ok

      device ->
        case Fcm.send_message(device.token, Push.fcm_message(payload)) do
          :ok ->
            :ok

          {:error, :unregistered} ->
            Repo.delete(device)
            :ok

          {:error, :retry} ->
            {:error, :retry}

          {:error, :not_configured} ->
            :ok

          {:error, reason} ->
            Logger.warning("[FCM] not delivered to device #{id}: #{inspect(reason)}")
            :ok
        end
    end
  end
end
