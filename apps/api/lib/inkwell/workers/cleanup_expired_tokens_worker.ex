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

    {push_count, _} = Inkwell.Push.cleanup_stale_subscriptions()

    if push_count > 0 do
      Logger.info("Cleaned up #{push_count} stale push subscription(s)")
    end

    {:ok, webhook_count} = Inkwell.Billing.cleanup_old_webhook_events()

    if webhook_count > 0 do
      Logger.info("Cleaned up #{webhook_count} old webhook event(s)")
    end

    {:ok, delivery_count} = Inkwell.Billing.cleanup_old_webhook_deliveries()

    if delivery_count > 0 do
      Logger.info("Cleaned up #{delivery_count} old webhook delivery log(s)")
    end

    Inkwell.Workers.Heartbeat.ping(:cleanup_expired_tokens)
    :ok
  end
end
