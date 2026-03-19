defmodule InkwellWeb.Plugs.OptionalAuth do
  @moduledoc """
  Like RequireAuth, but does not halt if no token is present.
  Assigns `current_user` when a valid Bearer token exists, otherwise passes through.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] ->
        token = String.trim(token)

        if String.starts_with?(token, "ink_") do
          case Inkwell.ApiKeys.verify_api_key(token) do
            {:ok, api_key} ->
              if api_key.user.blocked_at do
                # Blocked users treated as unauthenticated on optional auth routes
                conn
              else
                conn
                |> assign(:current_user, api_key.user)
                |> assign(:api_key, api_key)
                |> assign(:auth_method, :api_key)
              end
            :error -> conn
          end
        else
          case Inkwell.Auth.verify_api_session_token(token) do
            nil -> conn
            user_id ->
              user = Inkwell.Accounts.get_user!(user_id)
              if user.blocked_at do
                # Blocked users treated as unauthenticated on optional auth routes
                conn
              else
                assign(conn, :current_user, user)
              end
          end
        end

      _ ->
        conn
    end
  end
end
