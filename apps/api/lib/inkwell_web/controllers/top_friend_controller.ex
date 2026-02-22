defmodule InkwellWeb.TopFriendController do
  use InkwellWeb, :controller

  alias Inkwell.Social
  alias InkwellWeb.UserController

  # GET /api/me/top-friends
  def index(conn, _params) do
    top = Social.list_top_friends(conn.assigns.current_user.id)
    json(conn, %{
      data: Enum.map(top, fn {position, user} ->
        %{position: position, user: UserController.render_user_brief(user)}
      end)
    })
  end

  # PUT /api/me/top-friends
  # Body: { "friends": [{ "friend_id": "uuid", "position": 1 }, ...] }
  # Max 6 entries; front-end sends up to 6.
  def update(conn, %{"friends" => friends}) when is_list(friends) do
    user = conn.assigns.current_user
    clamped = Enum.take(friends, 6)

    case Social.update_top_friends(user.id, clamped) do
      {:ok, _} ->
        top = Social.list_top_friends(user.id)
        json(conn, %{
          data: Enum.map(top, fn {position, u} ->
            %{position: position, user: UserController.render_user_brief(u)}
          end)
        })

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: inspect(reason)})
    end
  end

  def update(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "friends array is required"})
  end
end
