defmodule Inkwell.Federation.Workers.DeliverActivityWorker do
  @moduledoc """
  Oban worker that delivers a single ActivityPub activity to a remote inbox.
  Retries up to 10 times with exponential backoff (30s, 1m, 2m, 4m, 8m, 16m, 32m, 64m, 128m, 256m).
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 10,
    priority: 1

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Federation.ActivityDelivery

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"activity" => activity, "inbox_url" => inbox_url, "user_id" => user_id}}) do
    case Repo.get(User, user_id) do
      nil ->
        Logger.warning("DeliverActivityWorker: user #{user_id} not found, discarding")
        :ok

      user ->
        instance_host = federation_config(:instance_host)
        key_id = "https://#{instance_host}/users/#{user.username}#main-key"

        case ActivityDelivery.deliver(activity, inbox_url, user.private_key, key_id) do
          :ok ->
            Inkwell.Federation.FederationStats.track_outbound(inbox_url, :ok)
            :ok
          {:error, {:http_error, status}} when status in [401, 403, 404, 410] ->
            # Don't retry on permanent errors
            Logger.info("Permanent delivery failure to #{inbox_url}: #{status}, not retrying")
            Inkwell.Federation.FederationStats.track_outbound(inbox_url, {:error, {:http_error, status}})
            :ok
          {:error, reason} ->
            Inkwell.Federation.FederationStats.track_outbound(inbox_url, {:error, reason})
            {:error, reason}
        end
    end
  end

  # Exponential backoff: 30s, 1m, 2m, 4m, ... up to ~4h
  @impl Oban.Worker
  def backoff(%Oban.Job{attempt: attempt}) do
    trunc(:math.pow(2, attempt) * 15)
  end

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key)
  end
end
