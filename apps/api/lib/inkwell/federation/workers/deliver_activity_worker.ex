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

  @signer_salt "federation signer"
  # Longer than every retry (the backoff tops out around 4h) and the Oban pruner.
  @signer_max_age 14 * 24 * 60 * 60

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"activity" => activity, "inbox_url" => inbox_url, "signer" => sealed}}) do
    case Phoenix.Token.decrypt(InkwellWeb.Endpoint, @signer_salt, sealed, max_age: @signer_max_age) do
      {:ok, %{"key_id" => key_id, "private_key" => pem}} ->
        deliver(activity, inbox_url, pem, key_id)

      _ ->
        Logger.warning("DeliverActivityWorker: unreadable or expired signer for #{inbox_url}, discarding")
        :ok
    end
  end

  def perform(%Oban.Job{args: %{"activity" => activity, "inbox_url" => inbox_url, "user_id" => user_id}}) do
    case Repo.get(User, user_id) do
      nil ->
        Logger.warning("DeliverActivityWorker: user #{user_id} not found, discarding")
        :ok

      user ->
        deliver(activity, inbox_url, user.private_key, key_id(user))
    end
  end

  @doc """
  The signing key, encrypted with the app secret, for a job that has to sign
  as an account that won't exist when it runs (the Delete{Person} sent when an
  account is deleted). Pass it as the job's `signer` instead of `user_id`.
  """
  def seal_signer(%User{} = user) do
    Phoenix.Token.encrypt(InkwellWeb.Endpoint, @signer_salt, %{"key_id" => key_id(user), "private_key" => user.private_key})
  end

  defp key_id(user), do: "https://#{federation_config(:instance_host)}/users/#{user.username}#main-key"

  defp deliver(activity, inbox_url, private_key, key_id) do
    case ActivityDelivery.deliver(activity, inbox_url, private_key, key_id) do
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
