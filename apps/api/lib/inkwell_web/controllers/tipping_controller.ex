defmodule InkwellWeb.TippingController do
  use InkwellWeb, :controller

  alias Inkwell.Tipping
  alias Inkwell.Accounts.User
  alias Inkwell.Repo

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

  # ── Tip Payment Endpoints ──────────────────────────────────────────

  # POST /api/tips — create a tip (returns client_secret for Stripe Elements)
  def create_tip(conn, %{"recipient_id" => recipient_id} = params) do
    sender = conn.assigns.current_user

    case Repo.get(User, recipient_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Writer not found."})

      recipient ->
        case Tipping.create_tip(sender, recipient, params) do
          {:ok, result} ->
            json(conn, %{data: result})

          {:error, :tips_not_enabled} ->
            conn |> put_status(:bad_request) |> json(%{error: "This writer has not enabled tips."})

          {:error, :no_connect_account} ->
            conn |> put_status(:bad_request) |> json(%{error: "This writer has not set up tipping."})

          {:error, :cannot_tip_self} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "You cannot tip yourself."})

          {:error, :invalid_amount} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Tip amount must be between $1 and $100."})

          {:error, :stripe_not_configured} ->
            conn |> put_status(:service_unavailable) |> json(%{error: "Payment processing is unavailable."})

          {:error, reason} ->
            Logger.error("Tip creation failed: #{inspect(reason)}")
            conn |> put_status(:internal_server_error) |> json(%{error: "Unable to process tip. Please try again."})
        end
    end
  end

  def create_tip(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "recipient_id is required."})
  end

  # POST /api/tips/:id/confirm — mark tip as succeeded after frontend payment confirmation
  def confirm_tip(conn, %{"id" => tip_id}) do
    case Tipping.confirm_tip(tip_id) do
      {:ok, _tip} ->
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Tip not found."})

      {:error, {:already_processed, _}} ->
        json(conn, %{ok: true})

      {:error, reason} ->
        Logger.error("Tip confirmation failed: #{inspect(reason)}")
        conn |> put_status(:internal_server_error) |> json(%{error: "Unable to confirm tip."})
    end
  end

  # GET /api/tips/received — writer's received tips (paginated)
  def tips_received(conn, params) do
    user = conn.assigns.current_user
    offset = String.to_integer(params["offset"] || "0")
    limit = String.to_integer(params["limit"] || "20")

    tips = Tipping.list_tips_received(user.id, offset: offset, limit: limit)

    json(conn, %{
      data: Enum.map(tips, &render_tip_received/1)
    })
  end

  # GET /api/tips/sent — reader's sent tips (paginated)
  def tips_sent(conn, params) do
    user = conn.assigns.current_user
    offset = String.to_integer(params["offset"] || "0")
    limit = String.to_integer(params["limit"] || "20")

    tips = Tipping.list_tips_sent(user.id, offset: offset, limit: limit)

    json(conn, %{
      data: Enum.map(tips, &render_tip_sent/1)
    })
  end

  # GET /api/tips/stats — writer's tip stats
  def tip_stats(conn, _params) do
    user = conn.assigns.current_user
    stats = Tipping.get_tip_stats(user.id)
    json(conn, %{data: stats})
  end

  # ── Private: Tip Renderers ──────────────────────────────────────────

  defp render_tip_received(tip) do
    sender = if tip.anonymous, do: nil, else: tip.sender

    %{
      id: tip.id,
      amount_cents: tip.amount_cents,
      anonymous: tip.anonymous,
      message: tip.message,
      created_at: tip.inserted_at,
      sender: if(sender, do: %{
        username: sender.username,
        display_name: sender.display_name,
        avatar_url: sender.avatar_url
      })
    }
  end

  defp render_tip_sent(tip) do
    %{
      id: tip.id,
      amount_cents: tip.amount_cents,
      anonymous: tip.anonymous,
      message: tip.message,
      created_at: tip.inserted_at,
      recipient: %{
        username: tip.recipient.username,
        display_name: tip.recipient.display_name,
        avatar_url: tip.recipient.avatar_url
      }
    }
  end
end
