defmodule Inkwell.Federation.Workers.DeliverActivityWorker do
  @moduledoc """
  Oban worker that delivers a single ActivityPub activity to a remote inbox.
  Retries up to 5 times with exponential backoff.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 5,
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
          :ok -> :ok
          {:error, {:http_error, status}} when status in [401, 403, 404, 410] ->
            # Don't retry on permanent errors
            Logger.info("Permanent delivery failure to #{inbox_url}: #{status}, not retrying")
            :ok
          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key)
  end
end
