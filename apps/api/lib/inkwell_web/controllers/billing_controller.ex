defmodule InkwellWeb.BillingController do
  use InkwellWeb, :controller

  alias Inkwell.Billing

  require Logger

  # POST /api/billing/checkout — create a checkout session (Square Payment Link)
  def checkout(conn, _params) do
    user = conn.assigns.current_user

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
  end

  def donor_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Choose $1, $2, or $3."})
  end

  # POST /api/billing/donate — create a one-time donation checkout
  def donate(conn, %{"amount_cents" => amount_cents}) when is_integer(amount_cents) and amount_cents in [300, 500, 1000] do
    user = conn.assigns.current_user

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
  end

  def donate(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Choose $3, $5, or $10."})
  end

  # POST /api/billing/onboarding-checkout — create checkout during onboarding
  def onboarding_checkout(conn, %{"type" => "plus"}) do
    user = conn.assigns.current_user

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
  end

  def onboarding_checkout(conn, %{"type" => "donor", "amount_cents" => amount_cents})
      when amount_cents in [100, 200, 300] do
    user = conn.assigns.current_user

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
  end

  def onboarding_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid checkout parameters."})
  end

  # GET /api/billing/status — return current subscription status
  def status(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      data: %{
        subscription_tier: Inkwell.SelfHosted.effective_tier(user),
        subscription_status: user.subscription_status || "none",
        subscription_expires_at: user.subscription_expires_at,
        ink_donor_status: user.ink_donor_status,
        ink_donor_amount_cents: user.ink_donor_amount_cents,
        self_hosted: Inkwell.SelfHosted.enabled?(),
        processor: "square"
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
              # Process asynchronously to return 200 quickly
              Task.start(fn -> Billing.handle_webhook_event(event) end)
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
end
