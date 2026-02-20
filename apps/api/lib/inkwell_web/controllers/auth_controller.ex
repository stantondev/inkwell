defmodule InkwellWeb.AuthController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts
  alias Inkwell.Auth

  # POST /api/auth/magic-link
  def send_magic_link(conn, %{"email" => email}) do
    email = String.downcase(String.trim(email))

    user =
      case Accounts.get_user_by_email(email) do
        nil ->
          username = derive_username(email)
          {:ok, new_user} = Accounts.create_user(%{
            email: email,
            username: unique_username(username),
            display_name: username
          })
          new_user

        existing -> existing
      end

    # Create token in Postgres
    token = Auth.create_magic_link_token(user.id)

    # Magic link goes to Next.js /auth/verify, which calls Phoenix back server-side.
    magic_link = "#{frontend_url()}/auth/verify?token=#{token}"

    # Send the email (or fall back to dev mode if no API key)
    case Inkwell.Email.send_magic_link(email, magic_link) do
      {:ok, :sent} ->
        json(conn, %{ok: true})

      {:ok, :no_email_configured, _link} ->
        # No email service configured — return the link directly for dev/testing
        json(conn, %{ok: true, dev_magic_link: magic_link})

      {:error, _reason} ->
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Failed to send email. Please try again."})
    end
  end

  def send_magic_link(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "email is required"})
  end

  # GET /api/auth/verify?token=TOKEN
  # Called server-side by Next.js /auth/verify route handler.
  # Returns a long-lived API token instead of a session cookie redirect.
  def verify_magic_link(conn, %{"token" => token}) do
    case Auth.verify_magic_link_token(token) do
      :error ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid or expired magic link"})

      {:ok, user_id} ->
        user = Accounts.get_user!(user_id)

        # Create a long-lived API session token in Postgres
        api_token = Auth.create_api_session_token(user.id)

        json(conn, %{
          ok: true,
          token: api_token,
          user: render_user(user)
        })
    end
  end

  def verify_magic_link(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "token is required"})
  end

  # GET /api/auth/me  (requires Bearer token via RequireAuth plug)
  def me(conn, _params) do
    json(conn, %{data: render_user(conn.assigns.current_user)})
  end

  # DELETE /api/auth/session
  def sign_out(conn, _params) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] ->
        Auth.revoke_api_session_token(String.trim(token))
      _ -> :ok
    end

    conn |> clear_session() |> json(%{ok: true})
  end

  # ── Helpers ─────────────────────────────────────────────────────────────────

  defp render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      pronouns: user.pronouns,
      ap_id: user.ap_id,
      created_at: user.inserted_at
    }
  end

  defp derive_username(email) do
    email
    |> String.split("@")
    |> List.first()
    |> String.replace(~r/[^a-zA-Z0-9_]/, "_")
    |> String.slice(0, 25)
  end

  defp unique_username(base) do
    if Accounts.get_user_by_username(base) do
      "#{base}_#{:rand.uniform(9999)}"
    else
      base
    end
  end

  defp frontend_url do
    Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
  end
end
