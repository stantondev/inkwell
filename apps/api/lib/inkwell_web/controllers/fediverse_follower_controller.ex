defmodule InkwellWeb.FediverseFollowerController do
  @moduledoc "A member's followers on other fediverse servers: remove one, and bot followers."
  use InkwellWeb, :controller

  alias Inkwell.Federation.Followers

  # DELETE /api/fediverse-followers/:remote_actor_id
  def remove(conn, %{"remote_actor_id" => remote_actor_id}) do
    user = conn.assigns.current_user

    with {:ok, _} <- Ecto.UUID.cast(remote_actor_id),
         :ok <- Followers.remove(user, remote_actor_id) do
      json(conn, %{ok: true})
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "This account doesn't follow you."})
    end
  end

  # GET /api/fediverse-followers/bots
  def bots(conn, _params) do
    user = conn.assigns.current_user
    bots = Followers.bot_followers(user.id)

    json(conn, %{
      data: Enum.map(bots, &render_actor/1),
      meta: %{count: length(bots), declining: Followers.declines_bots?(user)}
    })
  end

  # POST /api/fediverse-followers/bots/remove
  def remove_bots(conn, _params) do
    json(conn, %{data: %{removed: Followers.remove_bots(conn.assigns.current_user)}})
  end

  defp render_actor(actor) do
    %{
      id: actor.id,
      username: actor.username,
      domain: actor.domain,
      display_name: actor.display_name,
      avatar_url: actor.avatar_url,
      ap_id: actor.ap_id
    }
  end
end
