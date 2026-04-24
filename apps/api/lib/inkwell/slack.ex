defmodule Inkwell.Slack do
  @moduledoc """
  Sends notifications to Slack via incoming webhook.
  If SLACK_WEBHOOK_URL is not set, messages are logged and silently skipped (dev mode).
  """

  require Logger

  @doc "Send a plain text message (Slack mrkdwn) to the configured webhook."
  def notify(text) when is_binary(text) do
    webhook_url = Application.get_env(:inkwell, :slack_webhook_url)

    if is_nil(webhook_url) or webhook_url == "" do
      Logger.info("[Slack] (dev mode, not sent) #{text}")
      {:ok, :not_configured}
    else
      body = Jason.encode!(%{text: text})

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {~c"#{webhook_url}", [], ~c"application/json", body},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _, _}} when status in 200..299 ->
          {:ok, :sent}

        {:ok, {{_, status, _}, _, resp_body}} ->
          Logger.warning("[Slack] webhook error #{status}: #{to_string(resp_body)}")
          {:error, {:slack_error, status}}

        {:error, reason} ->
          Logger.warning("[Slack] HTTP error: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  # ── Convenience helpers ──────────────────────────────────────────────

  def notify_plus_subscription(username) do
    notify(":sparkles: *New Plus subscriber!* @#{username} just upgraded to Plus ($5/mo)")
  end

  def notify_ink_donor(username, amount_cents) do
    dollars = trunc((amount_cents || 0) / 100)
    notify(":droplet: *New Ink Donor!* @#{username} is donating $#{dollars}/mo")
  end

  def notify_plus_cancellation(username) do
    notify(":wave: *Plus canceled.* @#{username} reverted to Free tier")
  end

  def notify_donor_cancellation(username) do
    notify(":wave: *Ink Donor canceled.* @#{username} stopped their donation")
  end

  def notify_payment_failed(username, type) do
    label = if type == :donor, do: "Ink Donor", else: "Plus"
    notify(":warning: *Payment failed.* @#{username}'s #{label} payment didn't go through")
  end

  def notify_new_feedback(username, category, title) do
    notify(":memo: *New feedback!* @#{username} posted a #{category}: \"#{title}\"")
  end

  def notify_dispute(username, amount_cents, reason) do
    amount = if is_integer(amount_cents), do: "$#{trunc(amount_cents / 100)}", else: "unknown"
    user_label = if username, do: "@#{username}", else: "unknown user"
    notify(":rotating_light: *DISPUTE ALERT!* #{user_label} — #{amount} — reason: #{reason || "unknown"}. User has been auto-blocked.")
  end

  def notify_donation(username, amount_cents) do
    dollars = if is_integer(amount_cents), do: "$#{trunc(amount_cents / 100)}", else: "unknown"
    notify(":gift: *One-time donation!* @#{username} donated #{dollars}")
  end

  def notify_unmatched_subscription(sub_id, customer_id) do
    notify(
      ":rotating_light: *Unmatched Square subscription!* " <>
        "sub=`#{sub_id}` customer=`#{customer_id}` — no Inkwell user resolved via " <>
        "customer_id, reference_id, invoice→order, or email. Manually attach via admin panel."
    )
  end

  def notify_unmatched_donation(payment_id, customer_id, amount_cents) do
    dollars = if is_integer(amount_cents), do: "$#{trunc(amount_cents / 100)}", else: "unknown"

    notify(
      ":rotating_light: *Unmatched donation!* " <>
        "payment=`#{payment_id}` customer=`#{customer_id}` amount=#{dollars} — order looked " <>
        "like a one-time donation but no Inkwell user could be resolved. Investigate in admin panel."
    )
  end

  def notify_writer_plan_subscription(writer_username, subscriber_username, amount_cents) do
    dollars = trunc((amount_cents || 0) / 100)
    notify(":moneybag: *New plan subscriber!* @#{subscriber_username} subscribed to @#{writer_username}'s plan ($#{dollars}/mo)")
  end
end
