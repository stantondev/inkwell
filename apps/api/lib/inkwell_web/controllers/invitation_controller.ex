defmodule InkwellWeb.InvitationController do
  use InkwellWeb, :controller

  alias Inkwell.Invitations

  # GET /api/invite-code
  def get_code(conn, _params) do
    user = conn.assigns.current_user

    case Invitations.get_or_create_invite_code(user) do
      {:ok, code} ->
        json(conn, %{code: code, url: "#{frontend_url()}/i/#{code}"})

      {:error, _} ->
        conn |> put_status(500) |> json(%{error: "Failed to generate invite code"})
    end
  end

  # GET /api/invitations
  def index(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)

    invitations = Invitations.list_invitations(user.id, page: page)

    # Mask emails for privacy (show first char + domain)
    masked =
      Enum.map(invitations, fn inv ->
        %{
          id: inv.id,
          email: mask_email(inv.email),
          status: current_status(inv),
          message: inv.message,
          accepted_at: inv.accepted_at,
          expires_at: inv.expires_at,
          inserted_at: inv.inserted_at,
          accepted_by: if(inv.accepted_by && inv.accepted_by.username, do: inv.accepted_by, else: nil)
        }
      end)

    json(conn, %{invitations: masked})
  end

  # GET /api/invitations/stats
  def stats(conn, _params) do
    user = conn.assigns.current_user
    stats = Invitations.get_stats(user.id)
    today_count = Invitations.count_today(user.id)
    limit = Invitations.daily_limit(user.subscription_tier)

    json(conn, %{
      sent: stats.sent,
      accepted: stats.accepted,
      pending: stats.pending,
      today_count: today_count,
      daily_limit: limit
    })
  end

  # POST /api/invitations
  def create(conn, %{"emails" => emails} = params) when is_list(emails) do
    user = conn.assigns.current_user
    message = params["message"]

    # Max 5 emails per request
    emails = Enum.take(emails, 5)

    results =
      Enum.map(emails, fn email ->
        case Invitations.create_invitation(user, email, message) do
          {:ok, %Invitations.Invitation{} = invitation} ->
            # Enqueue email delivery worker
            %{invitation_id: invitation.id}
            |> Inkwell.Workers.InviteDeliveryWorker.new()
            |> Oban.insert()

            %{email: mask_email(email), status: "sent"}

          {:ok, :already_member} ->
            # Silent success — don't reveal that the email is registered
            %{email: mask_email(email), status: "sent"}

          {:error, :self_invite} ->
            %{email: mask_email(email), status: "error", error: "You can't invite yourself"}

          {:error, :daily_limit} ->
            %{email: mask_email(email), status: "error", error: "Daily invite limit reached"}

          {:error, :recently_invited} ->
            %{email: mask_email(email), status: "error", error: "Already invited recently"}

          {:error, _} ->
            %{email: mask_email(email), status: "error", error: "Failed to send"}
        end
      end)

    json(conn, %{results: results})
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "emails array is required"})
  end

  # GET /api/invite-link/:code (public — returns inviter info)
  def show_inviter(conn, %{"code" => code}) do
    case Invitations.get_user_by_invite_code(code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Invalid invite link"})

      user ->
        json(conn, %{
          username: user.username,
          display_name: user.display_name || user.username,
          avatar_url: user.avatar_url,
          avatar_frame: user.avatar_frame,
          subscription_tier: user.subscription_tier,
          bio: user.bio
        })
    end
  end

  # GET /api/invite-token/:token (public — returns inviter info + message)
  def show_invite(conn, %{"token" => token}) do
    case Inkwell.Repo.get_by(Invitations.Invitation, token: token) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Invalid or expired invitation"})

      %{status: "accepted"} ->
        conn |> put_status(:gone) |> json(%{error: "This invitation has already been accepted"})

      %{expires_at: expires_at} = invitation ->
        if DateTime.compare(DateTime.utc_now(), expires_at) == :gt do
          conn |> put_status(:gone) |> json(%{error: "This invitation has expired"})
        else
          inviter = Inkwell.Accounts.get_user!(invitation.inviter_id)

          json(conn, %{
            username: inviter.username,
            display_name: inviter.display_name || inviter.username,
            avatar_url: inviter.avatar_url,
            avatar_frame: inviter.avatar_frame,
            subscription_tier: inviter.subscription_tier,
            bio: inviter.bio,
            message: invitation.message
          })
        end
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp mask_email(email) do
    case String.split(email, "@") do
      [local, domain] when byte_size(local) > 1 ->
        "#{String.first(local)}***@#{domain}"

      _ ->
        "***@***"
    end
  end

  defp current_status(%{status: "accepted"}), do: "accepted"
  defp current_status(%{status: "pending", expires_at: expires_at}) do
    if DateTime.compare(DateTime.utc_now(), expires_at) == :gt, do: "expired", else: "pending"
  end
  defp current_status(%{status: status}), do: status

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} when n > 0 -> n
      _ -> default
    end
  end
  defp parse_int(_, default), do: default

  defp frontend_url do
    Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
  end
end
