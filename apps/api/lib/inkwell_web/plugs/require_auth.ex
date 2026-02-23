defmodule InkwellWeb.Plugs.RequireAuth do
  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_bearer_token(conn) do
      {:ok, token} -> authenticate_with_token(conn, token)
      :error       -> authenticate_with_session(conn)
    end
  end

  defp get_bearer_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] -> {:ok, String.trim(token)}
      _                         -> :error
    end
  end

  defp authenticate_with_token(conn, token) do
    case Inkwell.Auth.verify_api_session_token(token) do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid or expired token"})
        |> halt()

      user_id ->
        user = Inkwell.Accounts.get_user!(user_id)
        check_blocked(conn, user)
    end
  end

  defp authenticate_with_session(conn) do
    case get_session(conn, :user_id) do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Authentication required"})
        |> halt()

      user_id ->
        user = Inkwell.Accounts.get_user!(user_id)
        check_blocked(conn, user)
    end
  end

  defp check_blocked(conn, user) do
    if user.blocked_at do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "account_blocked"})
      |> halt()
    else
      assign(conn, :current_user, user)
    end
  end
end
