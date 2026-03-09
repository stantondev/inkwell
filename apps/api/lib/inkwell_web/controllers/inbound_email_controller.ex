defmodule InkwellWeb.InboundEmailController do
  use InkwellWeb, :controller

  require Logger

  @doc """
  POST /api/email/inbound
  Postmark inbound webhook. Always returns 200 (Postmark retries on non-200).
  Token verification via query param: ?token=SECRET
  """
  def inbound(conn, params) do
    expected_token = Application.get_env(:inkwell, :postmark_inbound_token)

    if is_nil(expected_token) or expected_token == "" do
      Logger.warning("[InboundEmail] POSTMARK_INBOUND_TOKEN not configured")
      json(conn, %{ok: true})
    else
      provided_token = conn.query_params["token"] || ""

      if Plug.Crypto.secure_compare(provided_token, expected_token) do
        case Inkwell.PostByEmail.process_inbound_email(params) do
          {:ok, entry} ->
            Logger.info("[InboundEmail] Created entry #{entry.id}")

          {:error, reason} ->
            Logger.warning("[InboundEmail] Rejected: #{reason}")
        end

        json(conn, %{ok: true})
      else
        Logger.warning("[InboundEmail] Invalid webhook token")
        json(conn, %{ok: true})
      end
    end
  end
end
