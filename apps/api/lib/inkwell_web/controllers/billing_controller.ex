defmodule InkwellWeb.BillingController do
  use InkwellWeb, :controller

  alias Inkwell.Billing

  require Logger

  @billing_rate_window 900  # 15 minutes

  # POST /api/billing/checkout — create a checkout session (Square Payment Link)
  def checkout(conn, _params) do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_plus(user) do
      case Billing.create_checkout_session(user) do
        {:ok, %{url: url}} ->
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Billing is not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Checkout session failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Please wait a few minutes before starting another checkout. You can only process one purchase at a time."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Plus subscription."})
    end
  end

  # POST /api/billing/cancel — cancel Plus subscription (replaces Stripe portal)
  def cancel(conn, _params) do
    user = conn.assigns.current_user

    case Billing.cancel_subscription(user) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      :ok ->
        json(conn, %{ok: true})

      {:error, :no_subscription} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "No active subscription found."})

      {:error, reason} ->
        Logger.error("Cancel subscription failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to cancel subscription. Please try again."})
    end
  end

  # POST /api/billing/cancel-donor — cancel Ink Donor subscription
  def cancel_donor(conn, _params) do
    user = conn.assigns.current_user

    case Billing.cancel_donor_subscription(user) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      :ok ->
        json(conn, %{ok: true})

      {:error, reason} ->
        Logger.error("Cancel donor subscription failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to cancel donation. Please try again."})
    end
  end

  # POST /api/billing/portal — legacy endpoint, redirects to cancel
  # Square has no hosted portal — we use inline cancel UI instead
  def portal(conn, _params) do
    conn
    |> put_status(:gone)
    |> json(%{error: "The billing portal is no longer available. Use the cancel button in Settings instead."})
  end

  # POST /api/billing/donor-checkout — create a checkout for Ink Donor (recurring)
  def donor_checkout(conn, %{"amount_cents" => amount_cents}) when amount_cents in [100, 200, 300] do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_donor(user) do
      case Billing.create_donor_checkout_session(user, amount_cents) do
        {:ok, %{url: url}} ->
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Donor checkout failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Please wait a few minutes before starting another checkout. You can only process one purchase at a time."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Ink Donor subscription."})
    end
  end

  def donor_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Choose $1, $2, or $3."})
  end

  # POST /api/billing/donate — create a one-time donation checkout
  # Accepts any amount between $1 and $500 (100-50000 cents)
  def donate(conn, %{"amount_cents" => amount_cents})
      when is_integer(amount_cents) and amount_cents >= 100 and amount_cents <= 50000 do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user) do
      case Billing.create_donation_checkout_session(user, amount_cents) do
        {:ok, %{url: url}} ->
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Donation checkout failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Please wait a few minutes before starting another checkout. You can only process one purchase at a time."})
    end
  end

  def donate(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Donations can be between $1 and $500."})
  end

  # POST /api/billing/onboarding-checkout — create checkout during onboarding
  def onboarding_checkout(conn, %{"type" => "plus"}) do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_plus(user) do
      case Billing.create_onboarding_checkout_session(user, "plus") do
        {:ok, %{url: url}} ->
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Billing is not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Onboarding checkout (Plus) failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Please wait a few minutes before starting another checkout. You can only process one purchase at a time."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Plus subscription."})
    end
  end

  def onboarding_checkout(conn, %{"type" => "donor", "amount_cents" => amount_cents})
      when amount_cents in [100, 200, 300] do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_donor(user) do
      case Billing.create_onboarding_checkout_session(user, "donor", amount_cents) do
        {:ok, %{url: url}} ->
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Onboarding checkout (Donor) failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Please wait a few minutes before starting another checkout. You can only process one purchase at a time."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Ink Donor subscription."})
    end
  end

  def onboarding_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid checkout parameters."})
  end

  # GET /api/billing/status — return current subscription status
  def status(conn, _params) do
    user = conn.assigns.current_user

    had_stripe =
      not is_nil(user.stripe_subscription_id) or
      not is_nil(user.ink_donor_stripe_subscription_id)

    has_square =
      not is_nil(user.square_subscription_id) or
      not is_nil(user.square_donor_subscription_id)

    json(conn, %{
      data: %{
        subscription_tier: Inkwell.SelfHosted.effective_tier(user),
        subscription_status: user.subscription_status || "none",
        subscription_expires_at: user.subscription_expires_at,
        ink_donor_status: user.ink_donor_status,
        ink_donor_amount_cents: user.ink_donor_amount_cents,
        self_hosted: Inkwell.SelfHosted.enabled?(),
        processor: "square",
        needs_resubscribe: had_stripe and not has_square
      }
    })
  end

  # POST /api/billing/webhook — receive Square webhook events
  # Raw body is cached by endpoint plug before JSON parsing
  def webhook(conn, _params) do
    raw_body = conn.assigns[:raw_body] || conn.private[:raw_body]
    signature = Plug.Conn.get_req_header(conn, "x-square-hmacsha256-signature") |> List.first()

    if is_nil(raw_body) do
      conn |> put_status(:bad_request) |> json(%{error: "Missing request body"})
    else
      case Billing.verify_webhook_signature(raw_body, signature) do
        :ok ->
          case Jason.decode(raw_body) do
            {:ok, event} ->
              # Process reliably via Oban worker (retries, persistence, dedup)
              Inkwell.Workers.WebhookProcessingWorker.new(%{"event" => event})
              |> Oban.insert()

              json(conn, %{received: true})

            {:error, _} ->
              conn |> put_status(:bad_request) |> json(%{error: "Invalid JSON"})
          end

        {:error, reason} ->
          Logger.warning("Square webhook signature verification failed: #{inspect(reason)}")
          conn |> put_status(:bad_request) |> json(%{error: "Invalid signature"})
      end
    end
  end

  # ── Private: Rate Limiting & Duplicate Prevention ──────────────────────

  defp check_billing_rate(user) do
    ensure_billing_rate_table()
    key = {:billing_checkout, user.id}
    now = System.system_time(:second)

    case :ets.lookup(:billing_rate_limit, key) do
      [{^key, last_time}] when now - last_time < @billing_rate_window ->
        {:error, :rate_limited}

      _ ->
        :ets.insert(:billing_rate_limit, {key, now})
        :ok
    end
  end

  defp check_no_active_plus(user) do
    if user.square_subscription_id && user.subscription_status == "active" do
      {:error, :already_subscribed}
    else
      :ok
    end
  end

  defp check_no_active_donor(user) do
    if user.square_donor_subscription_id && user.ink_donor_status == "active" do
      {:error, :already_subscribed}
    else
      :ok
    end
  end

  defp ensure_billing_rate_table do
    if :ets.whereis(:billing_rate_limit) == :undefined do
      :ets.new(:billing_rate_limit, [:named_table, :public, :set])
    end
  rescue
    ArgumentError -> :ok
  end
end
