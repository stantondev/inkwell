defmodule Inkwell.Billing do
  @moduledoc """
  Stripe integration for Inkwell Plus subscriptions.
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
        URI.encode_query(%{
          "customer" => customer_id,
          "mode" => "subscription",
          "line_items[0][price]" => config[:price_id],
          "line_items[0][quantity]" => "1",
          "success_url" => config[:success_url],
          "cancel_url" => config[:cancel_url],
          "client_reference_id" => user.id,
          "metadata[user_id]" => user.id
        })

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
      # In dev without webhook secret, accept all events
      Logger.warning("STRIPE_WEBHOOK_SECRET not set — accepting webhook without verification")
      :ok
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
             [ssl: [verify: :verify_none]],
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

  # ── Private: Webhook event handlers ────────────────────────────────────

  defp handle_checkout_completed(%{"customer" => customer_id, "subscription" => sub_id} = object) do
    user_id = get_in(object, ["metadata", "user_id"]) || get_in(object, ["client_reference_id"])

    user = if user_id, do: Repo.get(User, user_id), else: find_user_by_customer(customer_id)

    case user do
      nil ->
        Logger.error("checkout.session.completed — no user found for customer #{customer_id}")
        :error

      user ->
        user
        |> User.subscription_changeset(%{
          stripe_customer_id: customer_id,
          stripe_subscription_id: sub_id,
          subscription_tier: "plus",
          subscription_status: "active"
        })
        |> Repo.update()

        Logger.info("User #{user.username} upgraded to Plus (sub: #{sub_id})")
        :ok
    end
  end

  defp handle_checkout_completed(_), do: :ok

  defp handle_subscription_updated(%{"id" => sub_id, "status" => status, "customer" => customer_id} = object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil ->
        Logger.warning("subscription.updated — no user for customer #{customer_id}")
        :ok

      user ->
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
        :ok
    end
  end

  defp handle_subscription_deleted(%{"customer" => customer_id} = _object) do
    user = find_user_by_customer(customer_id)

    case user do
      nil ->
        :ok

      user ->
        user
        |> User.subscription_changeset(%{
          subscription_tier: "free",
          subscription_status: "canceled",
          stripe_subscription_id: nil
        })
        |> Repo.update()

        Logger.info("Subscription canceled for #{user.username} — reverted to Free")
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
        :ok
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
end
