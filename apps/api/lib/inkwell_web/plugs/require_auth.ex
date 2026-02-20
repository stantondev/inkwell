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
    case Inkwell.Redis.command!(["GET", "api_token:#{token}"]) do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid or expired token"})
        |> halt()

      user_id ->
        user = Inkwell.Accounts.get_user!(user_id)
        assign(conn, :current_user, user)
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
        assign(conn, :current_user, user)
    end
  end
end
