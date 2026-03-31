defmodule Inkwell.Billing do
  @moduledoc """
  Stripe integration for Inkwell Plus subscriptions and Ink Donor donations.
  Uses raw :httpc calls to the Stripe API (same pattern as Resend in Email module).
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  require Logger

  @stripe_api "https://api.stripe.com/v1"

  # ── Public API ──────────────────────────────────────────────────────────

  @doc "Create a Stripe customer for the given user (if they don't have one yet)."
  def ensure_customer(%User{} = user) do
    if user.stripe_customer_id do
      {:ok, user.stripe_customer_id}
    else
      case create_customer(user) do
        {:ok, customer_id} ->
          user
          |> User.subscription_changeset(%{stripe_customer_id: customer_id})
          |> Repo.update()

          {:ok, customer_id}

        error ->
          error
      end
    end
  end

  @doc "Create a Stripe Checkout session for upgrading to Plus."
  def create_checkout_session(%User{} = user) do
    with {:ok, customer_id} <- ensure_customer(user) do
      config = stripe_config()

      params =
        URI.encode_query(
          Map.merge(
            %{
              "customer" => customer_id,
              "mode" => "subscription",
              "line_items[0][price]" => config[:price_id],
              "line_items[0][quantity]" => "1",
              "success_url" => config[:success_url],
              "cancel_url" => config[:cancel_url],
              "client_reference_id" => user.id,
              "metadata[user_id]" => user.id
            },
            fraud_metadata(user)
          )
        )

      case stripe_post("/checkout/sessions", params) do
        {:ok, %{"url" => url, "id" => session_id}} ->
          {:ok, %{url: url, session_id: session_id}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc "Create a Stripe Customer Portal session for managing subscription."
  def create_portal_session(%User{} = user) do
    config = stripe_config()

    case user.stripe_customer_id do
      nil ->
        {:error, :no_customer}

      customer_id ->
        params = URI.encode_query(%{
          "customer" => customer_id,
          "return_url" => config[:cancel_url]
        })

        case stripe_post("/billing_portal/sessions", params) do
          {:ok, %{"url" => url}} -> {:ok, %{url: url}}
          {:error, reason} -> {:error, reason}
        end
    end
  end

  @doc "Cancel a Stripe subscription immediately (used during account deletion)."
  def cancel_subscription(subscription_id) do
    case stripe_delete("/subscriptions/#{subscription_id}") do
      {:ok, _} ->
        Logger.info("Canceled Stripe subscription #{subscription_id}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to cancel Stripe subscription #{subscription_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Create a Stripe Checkout session for an Ink Donor donation."
  def create_donor_checkout_session(%User{} = user, amount_cents) when amount_cents in [100, 200, 300] do
    config = stripe_config()

    price_id = case amount_cents do
      100 -> config[:ink_donor_price_1]
      200 -> config[:ink_donor_price_2]
      300 -> config[:ink_donor_price_3]
    end

    if is_nil(price_id) or price_id == "" do
      {:error, :stripe_not_configured}
    else
      with {:ok, customer_id} <- ensure_customer(user) do
        params =
          URI.encode_query(
            Map.merge(
              %{
                "customer" => customer_id,
                "mode" => "subscription",
                "line_items[0][price]" => price_id,
                "line_items[0][quantity]" => "1",
                "success_url" => config[:success_url] <> "&donor=true",
                "cancel_url" => config[:cancel_url],
                "client_reference_id" => user.id,
                "metadata[user_id]" => user.id,
                "metadata[type]" => "ink_donor",
                "metadata[amount_cents]" => to_string(amount_cents)
              },
              fraud_metadata(user)
            )
          )

        case stripe_post("/checkout/sessions", params) do
          {:ok, %{"url" => url, "id" => session_id}} ->
            {:ok, %{url: url, session_id: session_id}}

          {:error, reason} ->
            {:error, reason}
        end
      end
    end
  end

  @doc "Cancel an Ink Donor subscription immediately (used during account deletion)."
  def cancel_donor_subscription(nil), do: :ok
  def cancel_donor_subscription(subscription_id) do
    case stripe_delete("/subscriptions/#{subscription_id}") do
      {:ok, _} ->
        Logger.info("Canceled Ink Donor subscription #{subscription_id}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to cancel Ink Donor subscription #{subscription_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Create a Stripe Checkout session for Plus during onboarding (redirects back to /welcome)."
  def create_onboarding_checkout_session(%User{} = user, "plus") do
    with {:ok, customer_id} <- ensure_customer(user) do
      config = stripe_config()
      frontend_url = Application.get_env(:inkwell, :frontend_url) || "https://inkwell.social"

      if is_nil(config[:price_id]) or config[:price_id] == "" do
        {:error, :stripe_not_configured}
      else
        params =
          URI.encode_query(
            Map.merge(
              %{
                "customer" => customer_id,
                "mode" => "subscription",
                "line_items[0][price]" => config[:price_id],
                "line_items[0][quantity]" => "1",
                "success_url" => "#{frontend_url}/welcome?checkout=success&type=plus&step=5",
                "cancel_url" => "#{frontend_url}/welcome?checkout=canceled&step=5",
                "client_reference_id" => user.id,
                "metadata[user_id]" => user.id
              },
              fraud_metadata(user)
            )
          )

        case stripe_post("/checkout/sessions", params) do
          {:ok, %{"url" => url, "id" => session_id}} ->
            {:ok, %{url: url, session_id: session_id}}

          {:error, reason} ->
            {:error, reason}
        end
      end
    end
  end

  @doc "Create a Stripe Checkout session for Ink Donor during onboarding (redirects back to /welcome)."
  def create_onboarding_checkout_session(%User{} = user, "donor", amount_cents) when amount_cents in [100, 200, 300] do
    config = stripe_config()
    frontend_url = Application.get_env(:inkwell, :frontend_url) || "https://inkwell.social"

    price_id = case amount_cents do
      100 -> config[:ink_donor_price_1]
      200 -> config[:ink_donor_price_2]
      300 -> config[:ink_donor_price_3]
    end

    if is_nil(price_id) or price_id == "" do
      {:error, :stripe_not_configured}
    else
      with {:ok, customer_id} <- ensure_customer(user) do
        params =
          URI.encode_query(
            Map.merge(
              %{
                "customer" => customer_id,
                "mode" => "subscription",
                "line_items[0][price]" => price_id,
                "line_items[0][quantity]" => "1",
                "success_url" => "#{frontend_url}/welcome?checkout=success&type=donor&step=5",
                "cancel_url" => "#{frontend_url}/welcome?checkout=canceled&step=5",
                "client_reference_id" => user.id,
                "metadata[user_id]" => user.id,
                "metadata[type]" => "ink_donor",
                "metadata[amount_cents]" => to_string(amount_cents)
              },
              fraud_metadata(user)
            )
          )

        case stripe_post("/checkout/sessions", params) do
          {:ok, %{"url" => url, "id" => session_id}} ->
            {:ok, %{url: url, session_id: session_id}}

          {:error, reason} ->
            {:error, reason}
        end
      end
    end
  end

  # ── Webhook Processing ─────────────────────────────────────────────────

  @doc "Process a Stripe webhook event."
  def handle_webhook_event(%{"type" => type, "data" => %{"object" => object}}) do
    case type do
      "checkout.session.completed" ->
        handle_checkout_completed(object)

      "customer.subscription.updated" ->
        handle_subscription_updated(object)

      "customer.subscription.deleted" ->
        handle_subscription_deleted(object)

      "invoice.payment_failed" ->
        handle_payment_failed(object)

      "charge.dispute.created" ->
        handle_dispute_created(object)

      "charge.dispute.closed" ->
        handle_dispute_closed(object)

      "charge.refunded" ->
        handle_charge_refunded(object)

      _ ->
        Logger.info("Ignoring Stripe event: #{type}")
        :ok
    end
  end

  def handle_webhook_event(_), do: :ok

  @doc "Verify a Stripe webhook signature."
  def verify_webhook_signature(payload, signature_header) do
    webhook_secret = stripe_config()[:webhook_secret]

    if is_nil(webhook_secret) or webhook_secret == "" do
      if Application.get_env(:inkwell, :env) == :prod do
        # In production, NEVER accept unverified webhooks — could enable forged payment events
        Logger.error("STRIPE_WEBHOOK_SECRET not set in production — rejecting webhook")
        {:error, :webhook_secret_not_configured}
      else
        # In dev without webhook secret, accept all events
        Logger.warning("STRIPE_WEBHOOK_SECRET not set — accepting webhook without verification (dev only)")
        :ok
      end
    else
      verify_stripe_signature(payload, signature_header, webhook_secret)
    end
  end

  # ── Private: Stripe API helpers ────────────────────────────────────────

  defp create_customer(%User{} = user) do
    params = URI.encode_query(%{
      "email" => user.email,
      "name" => user.display_name || user.username,
      "metadata[user_id]" => user.id,
      "metadata[username]" => user.username
    })

    case stripe_post("/customers", params) do
      {:ok, %{"id" => id}} -> {:ok, id}
      {:error, reason} -> {:error, reason}
    end
  end

  defp stripe_post(path, body) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"},
        {~c"content-type", ~c"application/x-www-form-urlencoded"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {url, headers, ~c"application/x-www-form-urlencoded", body},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_delete(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

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
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on DELETE #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on DELETE #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_get(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :get,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on GET #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on GET #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  # ── Private: Webhook event handlers ────────────────────────────────────

  defp handle_checkout_completed(%{"customer" => customer_id, "subscription" => sub_id} = object) do
    user_id = get_in(object, ["metadata", "user_id"]) || get_in(object, ["client_reference_id"])

    user = if user_id, do: Repo.get(User, user_id), else: find_user_by_customer(customer_id)

    case user do
      nil ->
        Logger.error("checkout.session.completed — no user found for customer #{customer_id}")
        :error

      user ->
        metadata_type = get_in(object, ["metadata", "type"])

        cond do
          metadata_type == "writer_plan" ->
            Inkwell.WriterSubscriptions.handle_checkout_completed(object)

          metadata_type == "ink_donor" ->
            amount_cents = case get_in(object, ["metadata", "amount_cents"]) do
              s when is_binary(s) ->
                case Integer.parse(s) do
                  {n, _} -> n
                  :error -> nil
                end
              i when is_integer(i) -> i
              _ -> nil
            end

            # Ensure stripe_customer_id is set
            if is_nil(user.stripe_customer_id) do
              user |> User.subscription_changeset(%{stripe_customer_id: customer_id}) |> Repo.update()
            end

            user
            |> User.ink_donor_changeset(%{
              ink_donor_stripe_subscription_id: sub_id,
              ink_donor_status: "active",
              ink_donor_amount_cents: amount_cents
            })
            |> Repo.update()

            Logger.info("User #{user.username} became an Ink Donor ($#{(amount_cents || 0) / 100}/mo, sub: #{sub_id})")
            Inkwell.Slack.notify_ink_donor(user.username, amount_cents)

          true ->
            user
            |> User.subscription_changeset(%{
              stripe_customer_id: customer_id,
              stripe_subscription_id: sub_id,
              subscription_tier: "plus",
              subscription_status: "active"
            })
            |> Repo.update()

            Logger.info("User #{user.username} upgraded to Plus (sub: #{sub_id})")
            Inkwell.Slack.notify_plus_subscription(user.username)
        end

        :ok
    end
  end

  defp handle_checkout_completed(_), do: :ok

  defp handle_subscription_updated(%{"id" => sub_id, "status" => status, "customer" => customer_id} = object) do
    # Check if this is a writer plan subscription first
    case Inkwell.WriterSubscriptions.handle_subscription_updated(sub_id, status, get_in(object, ["current_period_end"])) do
      :ok -> :ok
      nil ->
        # Not a writer plan — fall through to Plus/Donor handling
        handle_subscription_updated_billing(sub_id, status, customer_id, object)
    end
  end

  defp handle_subscription_updated_billing(sub_id, status, customer_id, object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil ->
        Logger.warning("subscription.updated — no user for customer #{customer_id}")
        :ok

      user ->
        price_id = get_in(object, ["items", "data", Access.at(0), "price", "id"])

        if is_donor_price?(price_id) or sub_id == user.ink_donor_stripe_subscription_id do
          donor_status = if status in ["active", "trialing"], do: "active", else: status
          amount_cents = donor_amount_for_price(price_id)

          attrs = %{
            ink_donor_stripe_subscription_id: sub_id,
            ink_donor_status: donor_status
          }
          attrs = if amount_cents, do: Map.put(attrs, :ink_donor_amount_cents, amount_cents), else: attrs

          user
          |> User.ink_donor_changeset(attrs)
          |> Repo.update()

          Logger.info("Ink Donor subscription updated for #{user.username}: status=#{status}, amount=#{amount_cents || "unchanged"}")
        else
          expires_at = case get_in(object, ["current_period_end"]) do
            ts when is_integer(ts) -> DateTime.from_unix!(ts)
            _ -> nil
          end

          tier = if status in ["active", "trialing"], do: "plus", else: user.subscription_tier

          attrs = %{
            stripe_subscription_id: sub_id,
            subscription_status: status,
            subscription_tier: tier,
            subscription_expires_at: expires_at
          }

          user
          |> User.subscription_changeset(attrs)
          |> Repo.update()

          Logger.info("Subscription updated for #{user.username}: status=#{status}")
        end

        :ok
    end
  end

  defp handle_subscription_deleted(%{"id" => sub_id, "customer" => customer_id} = object) do
    # Check if this is a writer plan subscription first
    case Inkwell.WriterSubscriptions.handle_subscription_deleted(sub_id) do
      :ok -> :ok
      nil ->
        handle_subscription_deleted_billing(sub_id, customer_id, object)
    end
  end

  defp handle_subscription_deleted_billing(sub_id, customer_id, object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil ->
        :ok

      user ->
        price_id = get_in(object, ["items", "data", Access.at(0), "price", "id"])

        if is_donor_price?(price_id) or sub_id == user.ink_donor_stripe_subscription_id do
          user
          |> User.ink_donor_changeset(%{
            ink_donor_status: "canceled",
            ink_donor_stripe_subscription_id: nil
          })
          |> Repo.update()

          Logger.info("Ink Donor canceled for #{user.username}")
          Inkwell.Slack.notify_donor_cancellation(user.username)
        else
          user
          |> User.subscription_changeset(%{
            subscription_tier: "free",
            subscription_status: "canceled",
            stripe_subscription_id: nil
          })
          |> Repo.update()

          Logger.info("Subscription canceled for #{user.username} — reverted to Free")
          Inkwell.Slack.notify_plus_cancellation(user.username)

          # Deactivate custom domain on downgrade
          maybe_deactivate_custom_domain(user.id)
        end

        :ok
    end
  end

  defp handle_payment_failed(%{"customer" => customer_id, "subscription" => sub_id} = _object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil -> :ok
      user ->
        if sub_id == user.ink_donor_stripe_subscription_id do
          user
          |> User.ink_donor_changeset(%{ink_donor_status: "past_due"})
          |> Repo.update()

          Logger.warning("Ink Donor payment failed for #{user.username}")
          Inkwell.Slack.notify_payment_failed(user.username, :donor)
        else
          user
          |> User.subscription_changeset(%{subscription_status: "past_due"})
          |> Repo.update()

          Logger.warning("Payment failed for #{user.username} — marked past_due")
          Inkwell.Slack.notify_payment_failed(user.username, :plus)
        end

        :ok
    end
  end

  defp handle_payment_failed(%{"customer" => customer_id} = _object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil -> :ok
      user ->
        user
        |> User.subscription_changeset(%{subscription_status: "past_due"})
        |> Repo.update()

        Logger.warning("Payment failed for #{user.username} — marked past_due")
        Inkwell.Slack.notify_payment_failed(user.username, :plus)
        :ok
    end
  end

  # ── Private: Dispute/Chargeback handlers ────────────────────────────────

  defp handle_dispute_created(%{"charge" => charge_id} = object) do
    customer_id = get_in(object, ["customer"]) || get_charge_customer(charge_id)
    amount = get_in(object, ["amount"])
    reason = get_in(object, ["reason"])

    Logger.error("DISPUTE CREATED: charge=#{charge_id}, customer=#{customer_id}, amount=#{amount}, reason=#{reason}")

    user = if customer_id, do: find_user_by_customer(customer_id), else: nil

    case user do
      nil ->
        Logger.error("Dispute — no user found for customer #{customer_id}")
        Inkwell.Slack.notify_dispute(nil, amount, reason)
        :ok

      user ->
        # Auto-block the user immediately
        Inkwell.Accounts.block_user(user)
        Logger.error("FRAUD: Auto-blocked user #{user.username} due to dispute on charge #{charge_id}")

        # Cancel all subscriptions
        if user.stripe_subscription_id do
          stripe_delete("/subscriptions/#{user.stripe_subscription_id}")
        end

        if user.ink_donor_stripe_subscription_id do
          stripe_delete("/subscriptions/#{user.ink_donor_stripe_subscription_id}")
        end

        Inkwell.Slack.notify_dispute(user.username, amount, reason)
        :ok
    end
  end

  defp handle_dispute_created(_) do
    Logger.warning("charge.dispute.created — missing charge ID")
    :ok
  end

  defp handle_dispute_closed(%{"id" => dispute_id, "status" => status, "reason" => reason} = _object) do
    Logger.info("Dispute #{dispute_id} closed: status=#{status}, reason=#{reason}")
    :ok
  end

  defp handle_dispute_closed(_), do: :ok

  defp handle_charge_refunded(%{"id" => charge_id, "customer" => customer_id, "amount_refunded" => amount} = _object) do
    Logger.info("Charge #{charge_id} refunded: customer=#{customer_id}, amount=#{amount}")
    :ok
  end

  defp handle_charge_refunded(_), do: :ok

  defp get_charge_customer(nil), do: nil
  defp get_charge_customer(charge_id) do
    case stripe_get("/charges/#{charge_id}") do
      {:ok, %{"customer" => customer_id}} -> customer_id
      _ -> nil
    end
  end

  # ── Private: Fraud prevention metadata ──────────────────────────────────

  defp fraud_metadata(%User{} = user) do
    age_hours = DateTime.diff(DateTime.utc_now(), user.inserted_at, :hour)

    %{
      "metadata[username]" => user.username,
      "metadata[account_age_hours]" => to_string(age_hours),
      "payment_intent_data[metadata][user_id]" => user.id,
      "payment_intent_data[metadata][username]" => user.username
    }
  end

  # ── Private: Ink Donor helpers ─────────────────────────────────────────

  defp donor_price_ids do
    config = stripe_config()
    [config[:ink_donor_price_1], config[:ink_donor_price_2], config[:ink_donor_price_3]]
    |> Enum.reject(fn id -> is_nil(id) or id == "" end)
  end

  defp is_donor_price?(nil), do: false
  defp is_donor_price?(price_id), do: price_id in donor_price_ids()

  defp donor_amount_for_price(nil), do: nil
  defp donor_amount_for_price(price_id) do
    config = stripe_config()
    cond do
      price_id == config[:ink_donor_price_1] -> 100
      price_id == config[:ink_donor_price_2] -> 200
      price_id == config[:ink_donor_price_3] -> 300
      true -> nil
    end
  end

  # ── Private: Helpers ───────────────────────────────────────────────────

  defp find_user_by_customer(customer_id) do
    import Ecto.Query
    User |> where([u], u.stripe_customer_id == ^customer_id) |> Repo.one()
  end

  defp verify_stripe_signature(payload, signature_header, secret) do
    # Parse the Stripe-Signature header: t=timestamp,v1=signature
    parts =
      signature_header
      |> String.split(",")
      |> Enum.map(&String.trim/1)
      |> Enum.reduce(%{}, fn part, acc ->
        case String.split(part, "=", parts: 2) do
          [key, value] -> Map.put(acc, key, value)
          _ -> acc
        end
      end)

    timestamp = parts["t"]
    expected_sig = parts["v1"]

    if is_nil(timestamp) or is_nil(expected_sig) do
      {:error, :invalid_signature_header}
    else
      signed_payload = "#{timestamp}.#{payload}"
      computed = :crypto.mac(:hmac, :sha256, secret, signed_payload) |> Base.encode16(case: :lower)

      # Constant-time comparison
      if secure_compare(computed, expected_sig) do
        # Check timestamp is within 5 minutes (tolerance for clock skew)
        case Integer.parse(timestamp) do
          {ts, _} ->
            now = System.system_time(:second)
            if abs(now - ts) <= 300, do: :ok, else: {:error, :timestamp_expired}

          _ ->
            {:error, :invalid_timestamp}
        end
      else
        {:error, :signature_mismatch}
      end
    end
  end

  defp secure_compare(a, b) when byte_size(a) == byte_size(b) do
    :crypto.hash_equals(a, b)
  end

  defp secure_compare(_, _), do: false

  defp stripe_config do
    Application.get_env(:inkwell, :stripe, [])
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
end
