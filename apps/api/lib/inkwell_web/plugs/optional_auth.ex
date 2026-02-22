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
        case Inkwell.Auth.verify_api_session_token(String.trim(token)) do
          nil -> conn
          user_id ->
            user = Inkwell.Accounts.get_user!(user_id)
            assign(conn, :current_user, user)
        end

      _ ->
        conn
    end
  end
end
