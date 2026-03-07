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
      cond do
        target.id == user.id ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot follow yourself"})

        Social.is_blocked_between?(user.id, target.id) ->
          conn |> put_status(:forbidden) |> json(%{error: "Cannot follow this user"})

        true ->
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
          # Notify the requester that their request was accepted
          Accounts.create_notification(%{
            user_id: target.id,
            type: :follow_accepted,
            actor_id: user.id,
            target_type: "user",
            target_id: user.id
          })

          # Mark the follow_request notification as read for the accepting user
          Accounts.mark_follow_request_notifications_read(user.id, target.id)

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
          # Delete the follow_request notification so it doesn't show
          # stale Accept/Decline buttons after the requester cancels
          Accounts.delete_follow_request_notifications(target.id, user.id)

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
          # Mark the follow_request notification as read so it doesn't reappear
          Accounts.mark_follow_request_notifications_read(user.id, target.id)

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
          {:ok, _} ->
            # Delete any pending follow_request notifications (both directions)
            Accounts.delete_follow_request_notifications(user.id, target.id)
            Accounts.delete_follow_request_notifications(target.id, user.id)

            json(conn, %{ok: true})

          {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not block"})
        end
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # DELETE /api/relationships/:username/block
  def unblock(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    with target when not is_nil(target) <- Accounts.get_user_by_username(username) do
      case Social.unblock(user.id, target.id) do
        :ok -> json(conn, %{ok: true})
        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "Not blocked"})
      end
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # GET /api/fediverse-followers — remote actors following the current user
  def fediverse_followers(conn, _params) do
    user = conn.assigns.current_user
    actors = Social.list_fediverse_followers(user.id)
    json(conn, %{data: Enum.map(actors, &render_remote_actor/1)})
  end

  # GET /api/fediverse-following — remote actors the current user follows
  def fediverse_following(conn, _params) do
    user = conn.assigns.current_user
    actors = Social.list_fediverse_following(user.id)
    json(conn, %{data: Enum.map(actors, &render_remote_actor/1)})
  end

  defp render_remote_actor(actor) do
    %{
      id: actor.id,
      username: actor.username,
      domain: actor.domain,
      display_name: actor.display_name,
      avatar_url: actor.avatar_url,
      ap_id: actor.ap_id,
      profile_url: actor.ap_id
    }
  end

  # GET /api/blocked-users
  def blocked_users(conn, _params) do
    user = conn.assigns.current_user
    users = Social.list_blocked_users(user.id)
    json(conn, %{data: Enum.map(users, &UserController.render_user_brief/1)})
  end
end
