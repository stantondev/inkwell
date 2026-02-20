defmodule InkwellWeb.AuthController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts

  @magic_link_ttl 900         # 15 minutes
  @api_token_ttl  2_592_000   # 30 days

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

    token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
    Inkwell.Redis.command!(["SETEX", "magic_link:#{token}", @magic_link_ttl, user.id])

    # Magic link goes to Next.js /auth/verify, which calls Phoenix back server-side.
    magic_link = "#{frontend_url()}/auth/verify?token=#{token}"

    if Application.get_env(:inkwell, :env) == :prod do
      json(conn, %{ok: true})
    else
      json(conn, %{ok: true, dev_magic_link: magic_link})
    end
  end

  def send_magic_link(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "email is required"})
  end

  # GET /api/auth/verify?token=TOKEN
  # Called server-side by Next.js /auth/verify route handler.
  # Returns a long-lived API token instead of a session cookie redirect.
  def verify_magic_link(conn, %{"token" => token}) do
    case Inkwell.Redis.command!(["GETDEL", "magic_link:#{token}"]) do
      nil ->
        conn |> put_status(:unauthorized) |> json(%{error: "Invalid or expired magic link"})

      user_id ->
        user = Accounts.get_user!(user_id)

        api_token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
        Inkwell.Redis.command!(["SETEX", "api_token:#{api_token}", @api_token_ttl, user.id])

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
    # If a Bearer token was used, revoke it in Redis
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] ->
        Inkwell.Redis.command!(["DEL", "api_token:#{String.trim(token)}"])
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
