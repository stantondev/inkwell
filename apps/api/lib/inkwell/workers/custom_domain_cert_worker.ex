defmodule Inkwell.Workers.CustomDomainCertWorker do
  @moduledoc """
  Oban worker for async certificate cleanup when a user removes their
  custom domain or downgrades from Plus.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"action" => "delete", "hostname" => hostname}}) do
    case Inkwell.FlyCerts.delete_certificate(hostname) do
      :ok ->
        Logger.info("[CustomDomain] Certificate deleted for #{hostname}")
        :ok

      {:error, {:fly_error, 404, _}} ->
        Logger.debug("[CustomDomain] Certificate already gone for #{hostname}")
        :ok

      {:error, :fly_not_configured} ->
        Logger.warning("[CustomDomain] FLY_API_TOKEN not set — cannot delete cert for #{hostname}")
        :ok

      {:error, reason} ->
        Logger.error("[CustomDomain] Failed to delete cert for #{hostname}: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
