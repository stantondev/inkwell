defmodule InkwellWeb.BillingController do
  use InkwellWeb, :controller

  alias Inkwell.Billing

  require Logger

  # POST /api/billing/checkout — create a Stripe Checkout session
  def checkout(conn, _params) do
    user = conn.assigns.current_user

    case Billing.create_checkout_session(user) do
      {:ok, %{url: url}} ->
        json(conn, %{url: url})

      {:error, :stripe_not_configured} ->
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

  # POST /api/billing/portal — create a Stripe Customer Portal session
  def portal(conn, _params) do
    user = conn.assigns.current_user

    case Billing.create_portal_session(user) do
      {:ok, %{url: url}} ->
        json(conn, %{url: url})

      {:error, :no_customer} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "No billing account found. Subscribe to Plus first."})

      {:error, :stripe_not_configured} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Billing is not yet configured. Coming soon!"})

      {:error, reason} ->
        Logger.error("Portal session failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to open billing portal. Please try again."})
    end
  end

  # GET /api/billing/status — return current subscription status
  def status(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      data: %{
        subscription_tier: user.subscription_tier || "free",
        subscription_status: user.subscription_status || "none",
        subscription_expires_at: user.subscription_expires_at
      }
    })
  end

  # POST /api/billing/webhook — receive Stripe webhook events
  # Raw body is cached by endpoint plug before JSON parsing
  def webhook(conn, _params) do
    raw_body = conn.assigns[:raw_body] || conn.private[:raw_body]
    signature = Plug.Conn.get_req_header(conn, "stripe-signature") |> List.first()

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
          Logger.warning("Stripe webhook signature verification failed: #{inspect(reason)}")
          conn |> put_status(:bad_request) |> json(%{error: "Invalid signature"})
      end
    end
  end
end
