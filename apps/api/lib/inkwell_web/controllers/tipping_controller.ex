defmodule InkwellWeb.TippingController do
  use InkwellWeb, :controller

  alias Inkwell.Tipping

  require Logger

  # POST /api/tipping/connect — create Express account + return onboarding URL
  def connect(conn, _params) do
    user = conn.assigns.current_user

    # Plus-only feature
    if (user.subscription_tier || "free") != "plus" do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Integrated tips require an Inkwell Plus subscription"})
    else
      with {:ok, _account_id} <- Tipping.create_connect_account(user),
           # Reload user to get updated fields
           user <- Inkwell.Repo.get!(Inkwell.Accounts.User, user.id),
           {:ok, url} <- Tipping.create_onboarding_link(user) do
        json(conn, %{url: url})
      else
        {:error, :stripe_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Stripe is not configured. Please try again later."})

        {:error, reason} ->
          Logger.error("Connect account creation failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to set up tipping. Please try again."})
      end
    end
  end

  # GET /api/tipping/connect/status — check onboarding status
  def status(conn, _params) do
    user = conn.assigns.current_user

    case Tipping.check_account_status(user) do
      {:ok, status} ->
        # Also refresh DB if status changed
        if user.stripe_connect_account_id do
          Task.start(fn -> Tipping.refresh_connect_status(user) end)
        end

        json(conn, %{data: status})

      {:error, :stripe_not_configured} ->
        json(conn, %{data: %{connected: false, charges_enabled: false, payouts_enabled: false, onboarded: false}})

      {:error, reason} ->
        Logger.error("Connect status check failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to check status. Please try again."})
    end
  end

  # POST /api/tipping/connect/dashboard — return Express Dashboard login link
  def dashboard(conn, _params) do
    user = conn.assigns.current_user

    case Tipping.create_login_link(user) do
      {:ok, url} ->
        json(conn, %{url: url})

      {:error, :no_connect_account} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "No connected Stripe account found. Set up tipping first."})

      {:error, :stripe_not_configured} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Stripe is not configured."})

      {:error, reason} ->
        Logger.error("Dashboard link creation failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to open dashboard. Please try again."})
    end
  end

  # POST /api/tipping/connect/disconnect — disable tips, deauthorize account
  def disconnect(conn, _params) do
    user = conn.assigns.current_user

    case Tipping.disconnect_account(user) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      {:error, reason} ->
        Logger.error("Disconnect failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to disconnect. Please try again."})
    end
  end

  # POST /api/tipping/connect/refresh — force refresh onboarding link (when returning from expired link)
  def refresh(conn, _params) do
    user = conn.assigns.current_user

    case Tipping.create_onboarding_link(user) do
      {:ok, url} ->
        json(conn, %{url: url})

      {:error, :no_connect_account} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "No connected Stripe account found."})

      {:error, :stripe_not_configured} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Stripe is not configured."})

      {:error, reason} ->
        Logger.error("Refresh onboarding link failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to create onboarding link. Please try again."})
    end
  end
end
