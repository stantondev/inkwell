defmodule InkwellWeb.RelationshipControllerTest do
  use InkwellWeb.ConnCase, async: true

  alias Inkwell.Social

  describe "POST /api/relationships/:username/follow" do
    test "creates a pending follow request", %{conn: conn} do
      user = create_user()
      target = create_user()
      conn = log_in_user(conn, user)

      conn = post(conn, "/api/relationships/#{target.username}/follow")
      assert %{"ok" => true} = json_response(conn, 200)

      assert {:ok, rel} = Social.get_relationship(user.id, target.id)
      assert rel.status == :pending
    end

    test "returns error for non-existent user", %{conn: conn} do
      user = create_user()
      conn = log_in_user(conn, user)

      conn = post(conn, "/api/relationships/nonexistent_user_xyz/follow")
      assert json_response(conn, 404)
    end

    test "requires authentication", %{conn: conn} do
      target = create_user()
      conn = post(conn, "/api/relationships/#{target.username}/follow")
      assert json_response(conn, 401)
    end
  end

  describe "POST /api/relationships/:username/accept" do
    test "accepts a pending follow request", %{conn: conn} do
      requester = create_user()
      accepter = create_user()

      {:ok, _} = Social.follow(requester.id, accepter.id)
      conn = log_in_user(conn, accepter)

      conn = post(conn, "/api/relationships/#{requester.username}/accept")
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, rel} = Social.get_relationship(requester.id, accepter.id)
      assert rel.status == :accepted
      assert rel.is_mutual == true
    end

    test "returns error when no pending request exists", %{conn: conn} do
      user = create_user()
      other = create_user()
      conn = log_in_user(conn, user)

      conn = post(conn, "/api/relationships/#{other.username}/accept")
      assert json_response(conn, 404)
    end
  end

  describe "DELETE /api/relationships/:username/unfollow" do
    test "removes the follow relationship", %{conn: conn} do
      user = create_user()
      target = create_user()

      {:ok, _} = Social.follow(user.id, target.id)
      conn = log_in_user(conn, user)

      conn = delete(conn, "/api/relationships/#{target.username}/unfollow")
      assert %{"ok" => true} = json_response(conn, 200)

      assert {:error, :not_found} = Social.get_relationship(user.id, target.id)
    end

    test "returns error when not following", %{conn: conn} do
      user = create_user()
      target = create_user()
      conn = log_in_user(conn, user)

      conn = delete(conn, "/api/relationships/#{target.username}/unfollow")
      assert json_response(conn, 404)
    end
  end

  describe "DELETE /api/relationships/:username/reject" do
    test "rejects a pending follow request", %{conn: conn} do
      requester = create_user()
      rejecter = create_user()

      {:ok, _} = Social.follow(requester.id, rejecter.id)
      conn = log_in_user(conn, rejecter)

      conn = delete(conn, "/api/relationships/#{requester.username}/reject")
      assert %{"ok" => true} = json_response(conn, 200)
    end
  end

  describe "POST /api/relationships/:username/block" do
    test "blocks a user", %{conn: conn} do
      user = create_user()
      target = create_user()
      conn = log_in_user(conn, user)

      conn = post(conn, "/api/relationships/#{target.username}/block")
      assert %{"ok" => true} = json_response(conn, 200)

      assert Social.is_blocked_between?(user.id, target.id) == true
    end
  end

  describe "DELETE /api/relationships/:username/block" do
    test "unblocks a user", %{conn: conn} do
      user = create_user()
      target = create_user()

      {:ok, _} = Social.block(user.id, target.id)
      conn = log_in_user(conn, user)

      conn = delete(conn, "/api/relationships/#{target.username}/block")
      assert %{"ok" => true} = json_response(conn, 200)

      assert Social.is_blocked_between?(user.id, target.id) == false
    end
  end

  describe "DELETE /api/fediverse/unfollow" do
    test "unfollows a remote actor", %{conn: conn} do
      user = create_user()
      actor = create_remote_actor()

      create_relationship(%{
        follower_id: user.id,
        remote_actor_id: actor.id,
        status: :accepted
      })

      conn = log_in_user(conn, user)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete("/api/fediverse/unfollow", Jason.encode!(%{remote_actor_id: actor.id}))

      assert %{"ok" => true} = json_response(conn, 200)

      # Relationship should be deleted
      assert Social.unfollow_remote(user.id, actor.id) == {:error, :not_found}
    end

    test "returns 404 when not following remote actor", %{conn: conn} do
      user = create_user()
      actor = create_remote_actor()
      conn = log_in_user(conn, user)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete("/api/fediverse/unfollow", Jason.encode!(%{remote_actor_id: actor.id}))

      assert json_response(conn, 404)
    end

    test "returns 400 when remote_actor_id is missing", %{conn: conn} do
      user = create_user()
      conn = log_in_user(conn, user)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete("/api/fediverse/unfollow", Jason.encode!(%{}))

      assert json_response(conn, 400)
    end

    test "requires authentication", %{conn: conn} do
      conn = delete(conn, "/api/fediverse/unfollow")
      assert json_response(conn, 401)
    end

    test "cancels a pending follow request to a remote actor", %{conn: conn} do
      user = create_user()
      actor = create_remote_actor()

      create_relationship(%{
        follower_id: user.id,
        remote_actor_id: actor.id,
        status: :pending
      })

      conn = log_in_user(conn, user)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete("/api/fediverse/unfollow", Jason.encode!(%{remote_actor_id: actor.id}))

      assert %{"ok" => true} = json_response(conn, 200)
    end
  end
end
