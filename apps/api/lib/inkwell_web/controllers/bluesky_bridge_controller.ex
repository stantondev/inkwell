defmodule InkwellWeb.BlueskyBridgeController do
  @moduledoc "Settings → Fediverse → Share on Bluesky (via Bridgy Fed)."
  use InkwellWeb, :controller

  alias Inkwell.Federation.BlueskyBridge

  # GET /api/me/bluesky
  def show(conn, _params), do: json(conn, %{data: BlueskyBridge.status(conn.assigns.current_user)})

  # POST /api/me/bluesky
  def enable(conn, _params) do
    user = conn.assigns.current_user

    cond do
      not is_binary(user.avatar_url) or user.avatar_url == "" ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Bluesky's bridge needs a profile picture first. Add one in Settings → Avatar."})

      true ->
        case BlueskyBridge.enable(user) do
          {:ok, updated} -> json(conn, %{data: BlueskyBridge.status(updated)})
          {:error, _} -> unreachable(conn)
        end
    end
  end

  # DELETE /api/me/bluesky
  def disable(conn, _params) do
    case BlueskyBridge.disable(conn.assigns.current_user) do
      {:ok, updated} -> json(conn, %{data: BlueskyBridge.status(updated)})
      {:error, _} -> unreachable(conn)
    end
  end

  defp unreachable(conn) do
    conn
    |> put_status(:service_unavailable)
    |> json(%{error: "Couldn't reach the Bluesky bridge just now. Please try again in a minute."})
  end
end
