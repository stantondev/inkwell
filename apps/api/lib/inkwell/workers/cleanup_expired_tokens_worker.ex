defmodule Inkwell.Workers.CleanupExpiredTokensWorker do
  @moduledoc """
  Periodically deletes expired auth tokens (magic link + API session).
  Scheduled via Oban cron to run once per day.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    require Logger

    {:ok, count} = Inkwell.Auth.cleanup_expired_tokens()

    if count > 0 do
      Logger.info("Cleaned up #{count} expired auth token(s)")
    end

    {:ok, states_count} = Inkwell.OAuth.cleanup_expired_states()

    if states_count > 0 do
      Logger.info("Cleaned up #{states_count} expired OAuth state(s)")
    end

    {:ok, keys_count} = Inkwell.ApiKeys.cleanup_revoked_keys()

    if keys_count > 0 do
      Logger.info("Cleaned up #{keys_count} revoked API key(s)")
    end

    {:ok, invites_count} = Inkwell.Invitations.cleanup_expired()

    if invites_count > 0 do
      Logger.info("Cleaned up #{invites_count} expired invitation(s)")
    end

    {:ok, embeds_count} = Inkwell.Embeds.cleanup_old_embeds()

    if embeds_count > 0 do
      Logger.info("Cleaned up #{embeds_count} old URL embed cache(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_expired_tokens)
    :ok
  end
end
