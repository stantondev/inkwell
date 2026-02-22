defmodule InkwellWeb.RelationshipController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Social}
  alias InkwellWeb.UserController

  # GET /api/friends (returns all accepted follows — used by top friends editor)
  def friends(conn, _params) do
    user = conn.assigns.current_user
    friends = Social.list_friends(user.id)
    json(conn, %{data: Enum.map(friends, &UserController.render_user_brief/1)})
  end

  # GET /api/followers
  def followers(conn, _params) do
    user = conn.assigns.current_user
    followers = Social.list_followers(user.id)
    json(conn, %{data: Enum.map(followers, &UserController.render_user_brief/1)})
  end

  # GET /api/following
  def following(conn, _params) do
    user = conn.assigns.current_user
    friends = Social.list_friends(user.id)
    json(conn, %{data: Enum.map(friends, &UserController.render_user_brief/1)})
  end

  # GET /api/pen-pals — mutual connections
  def pen_pals(conn, _params) do
    user = conn.assigns.current_user
    pals = Social.list_pen_pals(user.id)
    json(conn, %{data: Enum.map(pals, &UserController.render_user_brief/1)})
  end

  # GET /api/readers — people following you (one-way)
  def readers(conn, _params) do
    user = conn.assigns.current_user
    readers = Social.list_readers(user.id)
    json(conn, %{data: Enum.map(readers, &UserController.render_user_brief/1)})
  end

  # GET /api/reading — people you follow (one-way)
  def reading(conn, _params) do
    user = conn.assigns.current_user
    reading = Social.list_reading(user.id)
    json(conn, %{data: Enum.map(reading, &UserController.render_user_brief/1)})
  end

  # POST /api/relationships/:username/follow
  def follow(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      if target.id == user.id do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot follow yourself"})
      else
        case Social.follow(user.id, target.id) do
          {:ok, _rel} ->
            # Notify the target
            Accounts.create_notification(%{
              user_id: target.id,
              type: :follow_request,
              actor_id: user.id,
              target_type: "user",
              target_id: target.id
            })

            json(conn, %{ok: true, status: "pending"})

          {:error, _changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Already following"})
        end
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # POST /api/relationships/:username/accept
  def accept(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      case Social.accept_follow(target.id, user.id) do
        {:ok, _rel} ->
          Accounts.create_notification(%{
            user_id: target.id,
            type: :follow_accepted,
            actor_id: user.id,
            target_type: "user",
            target_id: user.id
          })

          json(conn, %{ok: true, status: "accepted"})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "No pending follow request"})

        {:error, _} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not accept"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # DELETE /api/relationships/:username/unfollow
  def unfollow(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      case Social.unfollow(user.id, target.id) do
        {:ok, _} ->
          json(conn, %{ok: true})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "Not following this user"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # DELETE /api/relationships/:username/reject
  def reject(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      case Social.reject_follow(target.id, user.id) do
        {:ok, _} ->
          json(conn, %{ok: true})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "No pending follow request"})

        {:error, :not_pending} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Follow request is not pending"})

        {:error, _} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not reject"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # POST /api/relationships/:username/block
  def block(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      if target.id == user.id do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot block yourself"})
      else
        case Social.block(user.id, target.id) do
          {:ok, _} -> json(conn, %{ok: true})
          {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not block"})
        end
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end
end
