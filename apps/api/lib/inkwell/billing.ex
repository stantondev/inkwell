defmodule Inkwell.Billing do
  @moduledoc """
  Billing integration for Inkwell Plus subscriptions and Ink Donor donations.
  Currently uses Square as the payment processor (migrated from Stripe).
  Stripe code retained but inactive — will be re-enabled when LLC + new Stripe account is ready.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Square
  alias Inkwell.Repo

  require Logger

  # ── Public API ──────────────────────────────────────────────────────────

  @doc "Create a checkout session for upgrading to Plus."
  def create_checkout_session(%User{} = user) do
    Square.create_plus_payment_link(user)
  end

  @doc "Create a checkout session for an Ink Donor donation (recurring)."
  def create_donor_checkout_session(%User{} = user, amount_cents) when amount_cents in [100, 200, 300] do
    Square.create_donor_payment_link(user, amount_cents)
  end

  @doc "Create a checkout session for a one-time Ink Donor donation."
  def create_donation_checkout_session(%User{} = user, amount_cents) when is_integer(amount_cents) and amount_cents >= 100 do
    Square.create_donation_payment_link(user, amount_cents)
  end

  @doc "Create a checkout session for Plus during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "plus") do
    Square.create_onboarding_payment_link(user, "plus")
  end

  @doc "Create a checkout session for Ink Donor during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "donor", amount_cents) when amount_cents in [100, 200, 300] do
    Square.create_onboarding_payment_link(user, "donor", amount_cents)
  end

  @doc "Cancel a Plus subscription."
  def cancel_subscription(%User{} = user) do
    cond do
      user.square_subscription_id ->
        case Square.cancel_subscription(user.square_subscription_id) do
          :ok ->
            user
            |> User.subscription_changeset(%{
              subscription_status: "canceled"
            })
            |> Repo.update()

          {:error, reason} ->
            {:error, reason}
        end

      user.stripe_subscription_id ->
        # Legacy Stripe subscription — cancel via Stripe API if still active
        cancel_stripe_subscription(user.stripe_subscription_id)

      true ->
        {:error, :no_subscription}
    end
  end

  @doc "Cancel an Ink Donor subscription."
  def cancel_donor_subscription(%User{} = user) do
    cond do
      user.square_donor_subscription_id ->
        case Square.cancel_subscription(user.square_donor_subscription_id) do
          :ok ->
            user
            |> User.ink_donor_changeset(%{ink_donor_status: "canceled"})
            |> Repo.update()

          {:error, reason} ->
            {:error, reason}
        end

      user.ink_donor_stripe_subscription_id ->
        cancel_stripe_subscription(user.ink_donor_stripe_subscription_id)

      true ->
        :ok
    end
  end

  @doc "Cancel all subscriptions for a user (used during account deletion)."
  def cancel_all_subscriptions(%User{} = user) do
    # Cancel Plus
    if user.square_subscription_id do
      Square.cancel_subscription(user.square_subscription_id)
    end

    if user.stripe_subscription_id do
      cancel_stripe_subscription(user.stripe_subscription_id)
    end

    # Cancel Donor
    if user.square_donor_subscription_id do
      Square.cancel_subscription(user.square_donor_subscription_id)
    end

    if user.ink_donor_stripe_subscription_id do
      cancel_stripe_subscription(user.ink_donor_stripe_subscription_id)
    end

    :ok
  end

  # ── Webhook Processing (Square) ─────────────────────────────────────────

  @doc "Verify a Square webhook signature."
  def verify_webhook_signature(raw_body, signature_header) do
    # Determine notification URL from config
    api_url = Application.get_env(:inkwell, :api_url, "https://api.inkwell.social")
    notification_url = "#{api_url}/api/billing/webhook"
    Square.verify_webhook_signature(raw_body, signature_header, notification_url)
  end

  @doc "Process a Square webhook event."
  def handle_webhook_event(%{"type" => type, "data" => %{"object" => object}}) do
    case type do
      "subscription.created" ->
        handle_subscription_created(object)

      "subscription.updated" ->
        handle_square_subscription_updated(object)

      "invoice.payment_made" ->
        handle_invoice_payment_made(object)

      "invoice.payment_failed" ->
        handle_invoice_payment_failed(object)

      "dispute.created" ->
        handle_dispute_created(object)

      _ ->
        Logger.info("Ignoring Square event: #{type}")
        :ok
    end
  end

  def handle_webhook_event(%{"type" => type} = event) do
    # Some Square events have data at top level
    object = get_in(event, ["data", "object"]) || event["data"] || %{}
    handle_webhook_event(%{"type" => type, "data" => %{"object" => object}})
  end

  def handle_webhook_event(_), do: :ok

  # ── Private: Square Webhook Handlers ──────────────────────────────────

  defp handle_subscription_created(%{"subscription" => sub}) do
    handle_subscription_created(sub)
  end

  defp handle_subscription_created(%{"id" => sub_id, "customer_id" => customer_id} = sub) do
    plan_variation_id = get_in(sub, ["plan_variation_id"])
    config = Application.get_env(:inkwell, :square, [])

    user = find_user_by_square_customer(customer_id)

    case user do
      nil ->
        Logger.error("subscription.created — no user found for Square customer #{customer_id}")
        :error

      user ->
        if is_donor_plan?(plan_variation_id, config) do
          amount_cents = donor_amount_for_plan(plan_variation_id, config)

          user
          |> User.ink_donor_changeset(%{
            square_donor_subscription_id: sub_id,
            ink_donor_status: "active",
            ink_donor_amount_cents: amount_cents
          })
          |> Repo.update()

          # Also store customer ID if not set
          maybe_set_square_customer(user, customer_id)

          Logger.info("User #{user.username} became an Ink Donor ($#{(amount_cents || 0) / 100}/mo via Square)")
          Inkwell.Slack.notify_ink_donor(user.username, amount_cents)
        else
          user
          |> User.subscription_changeset(%{
            square_customer_id: customer_id,
            square_subscription_id: sub_id,
            subscription_tier: "plus",
            subscription_status: "active"
          })
          |> Repo.update()

          Logger.info("User #{user.username} upgraded to Plus via Square (sub: #{sub_id})")
          Inkwell.Slack.notify_plus_subscription(user.username)
        end

        :ok
    end
  end

  defp handle_subscription_created(_), do: :ok

  defp handle_square_subscription_updated(%{"subscription" => sub}) do
    handle_square_subscription_updated(sub)
  end

  defp handle_square_subscription_updated(%{"id" => sub_id, "status" => status} = sub) do
    customer_id = sub["customer_id"]
    plan_variation_id = sub["plan_variation_id"]
    config = Application.get_env(:inkwell, :square, [])
    inkwell_status = Square.map_subscription_status(status)

    user = find_user_by_square_customer(customer_id) || find_user_by_square_subscription(sub_id)

    case user do
      nil ->
        Logger.warning("subscription.updated — no user for Square subscription #{sub_id}")
        :ok

      user ->
        if is_donor_plan?(plan_variation_id, config) or sub_id == user.square_donor_subscription_id do
          user
          |> User.ink_donor_changeset(%{
            square_donor_subscription_id: sub_id,
            ink_donor_status: inkwell_status
          })
          |> Repo.update()

          if inkwell_status == "canceled" do
            Logger.info("Ink Donor canceled for #{user.username} (Square)")
            Inkwell.Slack.notify_donor_cancellation(user.username)
          end
        else
          expires_at = case sub["charged_through_date"] do
            date when is_binary(date) ->
              case Date.from_iso8601(date) do
                {:ok, d} -> DateTime.new!(d, ~T[23:59:59], "Etc/UTC")
                _ -> nil
              end
            _ -> nil
          end

          tier = if inkwell_status in ["active"], do: "plus", else: user.subscription_tier

          user
          |> User.subscription_changeset(%{
            square_subscription_id: sub_id,
            subscription_status: inkwell_status,
            subscription_tier: tier,
            subscription_expires_at: expires_at
          })
          |> Repo.update()

          if inkwell_status == "canceled" do
            Logger.info("Plus subscription canceled for #{user.username} (Square)")
            Inkwell.Slack.notify_plus_cancellation(user.username)
            maybe_deactivate_custom_domain(user.id)
          end
        end

        :ok
    end
  end

  defp handle_square_subscription_updated(_), do: :ok

  defp handle_invoice_payment_made(%{"subscription_id" => sub_id}) when is_binary(sub_id) do
    user = find_user_by_square_subscription(sub_id)

    case user do
      nil -> :ok
      user ->
        # Confirm subscription is active
        if sub_id == user.square_donor_subscription_id do
          user |> User.ink_donor_changeset(%{ink_donor_status: "active"}) |> Repo.update()
        else
          user |> User.subscription_changeset(%{subscription_status: "active"}) |> Repo.update()
        end

        :ok
    end
  end

  defp handle_invoice_payment_made(_), do: :ok

  defp handle_invoice_payment_failed(%{"subscription_id" => sub_id}) when is_binary(sub_id) do
    user = find_user_by_square_subscription(sub_id)

    case user do
      nil -> :ok
      user ->
        if sub_id == user.square_donor_subscription_id do
          user |> User.ink_donor_changeset(%{ink_donor_status: "past_due"}) |> Repo.update()
          Logger.warning("Ink Donor payment failed for #{user.username} (Square)")
          Inkwell.Slack.notify_payment_failed(user.username, :donor)
        else
          user |> User.subscription_changeset(%{subscription_status: "past_due"}) |> Repo.update()
          Logger.warning("Payment failed for #{user.username} — marked past_due (Square)")
          Inkwell.Slack.notify_payment_failed(user.username, :plus)
        end

        :ok
    end
  end

  defp handle_invoice_payment_failed(_), do: :ok

  # ── Private: Dispute/Chargeback handler (same auto-block as Stripe) ────

  defp handle_dispute_created(%{"amount_money" => %{"amount" => amount}} = object) do
    customer_id = object["customer_id"]
    reason = object["reason"]

    Logger.error("DISPUTE CREATED (Square): customer=#{customer_id}, amount=#{amount}, reason=#{reason}")

    user = if customer_id, do: find_user_by_square_customer(customer_id), else: nil

    case user do
      nil ->
        Logger.error("Dispute — no user found for Square customer #{customer_id}")
        Inkwell.Slack.notify_dispute(nil, amount, reason)
        :ok

      user ->
        # Auto-block the user immediately
        Inkwell.Accounts.block_user(user)
        Logger.error("FRAUD: Auto-blocked user #{user.username} due to Square dispute")

        # Cancel all subscriptions
        cancel_all_subscriptions(user)

        Inkwell.Slack.notify_dispute(user.username, amount, reason)
        :ok
    end
  end

  defp handle_dispute_created(_) do
    Logger.warning("dispute.created — missing amount data")
    :ok
  end

  # ── Private: Helpers ───────────────────────────────────────────────────

  defp find_user_by_square_customer(nil), do: nil
  defp find_user_by_square_customer(customer_id) do
    import Ecto.Query
    User |> where([u], u.square_customer_id == ^customer_id) |> Repo.one()
  end

  defp find_user_by_square_subscription(nil), do: nil
  defp find_user_by_square_subscription(sub_id) do
    import Ecto.Query

    User
    |> where([u], u.square_subscription_id == ^sub_id or u.square_donor_subscription_id == ^sub_id)
    |> Repo.one()
  end

  defp maybe_set_square_customer(user, customer_id) do
    if is_nil(user.square_customer_id) do
      user |> User.subscription_changeset(%{square_customer_id: customer_id}) |> Repo.update()
    end
  end

  defp is_donor_plan?(nil, _config), do: false
  defp is_donor_plan?(plan_variation_id, config) do
    donor_ids = [config[:donor_plan_variation_1], config[:donor_plan_variation_2], config[:donor_plan_variation_3]]
    |> Enum.reject(fn id -> is_nil(id) or id == "" end)

    plan_variation_id in donor_ids
  end

  defp donor_amount_for_plan(nil, _config), do: nil
  defp donor_amount_for_plan(plan_variation_id, config) do
    cond do
      plan_variation_id == config[:donor_plan_variation_1] -> 100
      plan_variation_id == config[:donor_plan_variation_2] -> 200
      plan_variation_id == config[:donor_plan_variation_3] -> 300
      true -> nil
    end
  end

  defp maybe_deactivate_custom_domain(user_id) do
    case Inkwell.CustomDomains.get_domain_by_user(user_id) do
      nil ->
        :ok

      domain when domain.status in ["active", "pending_cert", "pending_dns"] ->
        Inkwell.CustomDomains.update_status(domain, "removed")

        if domain.status in ["active", "pending_cert"] do
          Inkwell.Workers.CustomDomainCertWorker.new(%{
            "action" => "delete",
            "hostname" => domain.domain
          })
          |> Oban.insert()
        end

      _domain ->
        :ok
    end
  end

  # ── Legacy Stripe helpers (for canceling existing Stripe subscriptions) ──

  @stripe_api "https://api.stripe.com/v1"

  defp cancel_stripe_subscription(subscription_id) do
    secret_key = Application.get_env(:inkwell, :stripe, [])[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot cancel Stripe subscription #{subscription_id}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}/subscriptions/#{subscription_id}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :delete,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _resp_body}} when status in 200..299 ->
          Logger.info("Canceled legacy Stripe subscription #{subscription_id}")
          :ok

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe cancel error #{status}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error canceling #{subscription_id}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end
end
