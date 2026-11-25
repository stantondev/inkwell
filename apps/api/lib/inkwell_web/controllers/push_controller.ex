defmodule InkwellWeb.PushController do
  use InkwellWeb, :controller

  alias Inkwell.Push

  @doc "GET /api/push/vapid-key — returns VAPID public key (public, no auth)."
  def vapid_key(conn, _params) do
    if Push.configured?() do
      json(conn, %{enabled: true, public_key: Push.vapid_public_key()})
    else
      json(conn, %{enabled: false, public_key: nil})
    end
  end

  @doc "POST /api/push/subscribe — upsert push subscription (auth required)."
  def subscribe(conn, params) do
    user_id = conn.assigns.current_user.id

    attrs = %{
      "endpoint" => params["endpoint"],
      "p256dh" => params["p256dh"],
      "auth" => params["auth"],
      "user_agent" => params["user_agent"]
    }

    case Push.subscribe(user_id, attrs) do
      {:ok, _sub} ->
        json(conn, %{ok: true})

      {:error, changeset} ->
        conn
        |> put_status(422)
        |> json(%{error: "Invalid subscription", details: format_errors(changeset)})
    end
  end

  @doc "POST /api/push/unsubscribe — remove push subscription (auth required)."
  def unsubscribe(conn, %{"endpoint" => endpoint}) do
    user_id = conn.assigns.current_user.id
    Push.unsubscribe(user_id, endpoint)
    json(conn, %{ok: true})
  end

  def unsubscribe(conn, _params) do
    conn
    |> put_status(422)
    |> json(%{error: "endpoint is required"})
  end

  @doc """
  POST /api/push/devices — the Inkwell app registers this phone's Firebase
  token. Signed-in browser sessions only (the app's pages call it through
  the web proxy with the session cookie), so the device follows that session.
  """
  def register_device(conn, params) do
    user_id = conn.assigns.current_user.id
    auth_token_id = session_token_id(conn)

    case Push.register_device(user_id, auth_token_id, params) do
      {:ok, _device} ->
        json(conn, %{ok: true})

      {:error, changeset} ->
        conn
        |> put_status(422)
        |> json(%{error: "Invalid device", details: format_errors(changeset)})
    end
  end

  @doc "DELETE /api/push/devices — forget this phone (notifications turned off in the app)."
  def unregister_device(conn, %{"token" => token}) when is_binary(token) do
    Push.unregister_device(conn.assigns.current_user.id, token)
    json(conn, %{ok: true})
  end

  def unregister_device(conn, _params) do
    conn |> put_status(422) |> json(%{error: "token is required"})
  end

  defp session_token_id(conn) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         false <- String.starts_with?(token, "ink_") do
      Inkwell.Auth.api_session_token_id(token)
    else
      _ -> nil
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
