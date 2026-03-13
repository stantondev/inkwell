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

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
