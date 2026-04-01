defmodule InkwellWeb.TippingController do
  use InkwellWeb, :controller

  alias Inkwell.Tipping
  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  require Logger

  @postage_unavailable_message "Postage is temporarily unavailable while we switch payment processors. It will return soon."

  # POST /api/tipping/connect — temporarily disabled (requires Stripe Connect)
  def connect(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
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

  # POST /api/tipping/connect/dashboard — temporarily disabled
  def dashboard(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
  end

  # POST /api/tipping/connect/disconnect — temporarily disabled
  def disconnect(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
  end

  # POST /api/tipping/connect/refresh — temporarily disabled
  def refresh(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
  end

  # ── Tip Payment Endpoints ──────────────────────────────────────────

  # POST /api/tips — temporarily disabled (requires Stripe Connect)
  def create_tip(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
  end

  # POST /api/tips/:id/confirm — temporarily disabled (requires Stripe Connect)
  def confirm_tip(conn, _params) do
    conn |> put_status(:service_unavailable) |> json(%{error: @postage_unavailable_message})
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
