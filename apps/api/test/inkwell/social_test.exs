defmodule Inkwell.SocialTest do
  use Inkwell.DataCase, async: true

  alias Inkwell.Social
  alias Inkwell.Social.Relationship

  describe "follow/2" do
    test "creates a pending relationship" do
      user1 = create_user()
      user2 = create_user()

      assert {:ok, rel} = Social.follow(user1.id, user2.id)
      assert rel.follower_id == user1.id
      assert rel.following_id == user2.id
      assert rel.status == :pending
      assert rel.is_mutual == false
    end

    test "prevents duplicate follows" do
      user1 = create_user()
      user2 = create_user()

      assert {:ok, _} = Social.follow(user1.id, user2.id)

      assert_raise Ecto.ConstraintError, fn ->
        Social.follow(user1.id, user2.id)
      end
    end

    test "prevents self-follow" do
      user = create_user()
      assert {:error, changeset} = Social.follow(user.id, user.id)
      assert errors_on(changeset)[:following_id]
    end
  end

  describe "accept_follow/2" do
    test "accepts pending follow and creates mutual relationship" do
      user1 = create_user()
      user2 = create_user()

      {:ok, _} = Social.follow(user1.id, user2.id)
      assert {:ok, rel} = Social.accept_follow(user1.id, user2.id)
      assert rel.status == :accepted
      assert rel.is_mutual == true

      # Reverse relationship should also exist and be mutual
      assert {:ok, reverse} = Social.get_relationship(user2.id, user1.id)
      assert reverse.status == :accepted
      assert reverse.is_mutual == true
    end

    test "returns error when no pending follow exists" do
      user1 = create_user()
      user2 = create_user()

      assert {:error, :not_found} = Social.accept_follow(user1.id, user2.id)
    end
  end

  describe "unfollow/2" do
    test "deletes the follow relationship" do
      user1 = create_user()
      user2 = create_user()

      {:ok, _} = Social.follow(user1.id, user2.id)
      assert {:ok, _} = Social.unfollow(user1.id, user2.id)
      assert {:error, :not_found} = Social.get_relationship(user1.id, user2.id)
    end

    test "updates reverse relationship is_mutual when unfollowing a mutual connection" do
      user1 = create_user()
      user2 = create_user()

      # Create mutual pen pal
      {:ok, _} = Social.follow(user1.id, user2.id)
      {:ok, _} = Social.accept_follow(user1.id, user2.id)

      # Verify both sides are mutual
      {:ok, rel1} = Social.get_relationship(user1.id, user2.id)
      assert rel1.is_mutual == true
      {:ok, rel2} = Social.get_relationship(user2.id, user1.id)
      assert rel2.is_mutual == true

      # Unfollow from one side
      assert {:ok, _} = Social.unfollow(user1.id, user2.id)

      # Forward relationship should be gone
      assert {:error, :not_found} = Social.get_relationship(user1.id, user2.id)

      # Reverse should still exist but no longer mutual
      {:ok, reverse} = Social.get_relationship(user2.id, user1.id)
      assert reverse.is_mutual == false
    end

    test "returns error when not following" do
      user1 = create_user()
      user2 = create_user()

      assert {:error, :not_found} = Social.unfollow(user1.id, user2.id)
    end
  end

  describe "block/2" do
    test "creates a blocked relationship and removes existing relationships" do
      user1 = create_user()
      user2 = create_user()

      # Create mutual pen pal first
      {:ok, _} = Social.follow(user1.id, user2.id)
      {:ok, _} = Social.accept_follow(user1.id, user2.id)

      # Block
      assert {:ok, block_rel} = Social.block(user1.id, user2.id)
      assert block_rel.status == :blocked

      # The block replaces the existing relationship with a blocked one
      {:ok, found} = Social.get_relationship(user1.id, user2.id)
      assert found.status == :blocked
    end

    test "removes top friends between blocked users" do
      user1 = create_user()
      user2 = create_user()

      # Create top friend
      %Inkwell.Social.TopFriend{}
      |> Ecto.Changeset.change(%{user_id: user1.id, friend_id: user2.id, position: 1})
      |> Repo.insert!()

      Social.block(user1.id, user2.id)

      assert Repo.all(
        from tf in Inkwell.Social.TopFriend,
          where: tf.user_id == ^user1.id and tf.friend_id == ^user2.id
      ) == []
    end
  end

  describe "unblock/2" do
    test "removes the block" do
      user1 = create_user()
      user2 = create_user()

      {:ok, _} = Social.block(user1.id, user2.id)
      assert :ok = Social.unblock(user1.id, user2.id)
      assert Social.is_blocked_between?(user1.id, user2.id) == false
    end

    test "returns error when not blocked" do
      user1 = create_user()
      user2 = create_user()

      assert {:error, :not_found} = Social.unblock(user1.id, user2.id)
    end
  end

  describe "is_blocked_between?/2" do
    test "returns true when blocked in either direction" do
      user1 = create_user()
      user2 = create_user()

      {:ok, _} = Social.block(user1.id, user2.id)

      assert Social.is_blocked_between?(user1.id, user2.id) == true
      assert Social.is_blocked_between?(user2.id, user1.id) == true
    end

    test "returns false when not blocked" do
      user1 = create_user()
      user2 = create_user()

      assert Social.is_blocked_between?(user1.id, user2.id) == false
    end
  end

  describe "get_relationship/2" do
    test "returns {:ok, relationship} when exists" do
      user1 = create_user()
      user2 = create_user()

      {:ok, _} = Social.follow(user1.id, user2.id)
      assert {:ok, rel} = Social.get_relationship(user1.id, user2.id)
      assert rel.follower_id == user1.id
    end

    test "returns {:error, :not_found} when not exists" do
      user1 = create_user()
      user2 = create_user()

      assert {:error, :not_found} = Social.get_relationship(user1.id, user2.id)
    end
  end

  describe "list_friends/1" do
    test "returns only accepted follows" do
      user = create_user()
      friend = create_user()
      pending = create_user()

      {:ok, _} = Social.follow(user.id, friend.id)
      {:ok, _} = Social.accept_follow(user.id, friend.id)
      {:ok, _} = Social.follow(user.id, pending.id)

      friends = Social.list_friends(user.id)
      friend_ids = Enum.map(friends, & &1.id)

      assert friend.id in friend_ids
      refute pending.id in friend_ids
    end
  end

  describe "list_friend_ids/1" do
    test "returns IDs of accepted follows" do
      user = create_user()
      friend = create_user()

      {:ok, _} = Social.follow(user.id, friend.id)
      {:ok, _} = Social.accept_follow(user.id, friend.id)

      ids = Social.list_friend_ids(user.id)
      assert friend.id in ids
    end
  end

  # ── Remote / Fediverse relationship tests ──────────────────────────────

  describe "unfollow_remote/2" do
    test "deletes the relationship with a remote actor" do
      user = create_user()
      actor = create_remote_actor()

      create_relationship(%{
        follower_id: user.id,
        remote_actor_id: actor.id,
        status: :accepted
      })

      assert {:ok, _} = Social.unfollow_remote(user.id, actor.id)

      # Relationship should be gone
      assert Repo.all(
        from r in Relationship,
          where: r.follower_id == ^user.id and r.remote_actor_id == ^actor.id
      ) == []
    end

    test "returns error when not following remote actor" do
      user = create_user()
      actor = create_remote_actor()

      assert {:error, :not_found} = Social.unfollow_remote(user.id, actor.id)
    end

    test "does not affect other users' relationships with the same remote actor" do
      user1 = create_user()
      user2 = create_user()
      actor = create_remote_actor()

      create_relationship(%{
        follower_id: user1.id,
        remote_actor_id: actor.id,
        status: :accepted
      })

      create_relationship(%{
        follower_id: user2.id,
        remote_actor_id: actor.id,
        status: :accepted
      })

      # Unfollow from user1 only
      assert {:ok, _} = Social.unfollow_remote(user1.id, actor.id)

      # user2's relationship should still exist
      assert Repo.one(
        from r in Relationship,
          where: r.follower_id == ^user2.id and r.remote_actor_id == ^actor.id
      )
    end

    test "works for pending follow requests to remote actors" do
      user = create_user()
      actor = create_remote_actor()

      create_relationship(%{
        follower_id: user.id,
        remote_actor_id: actor.id,
        status: :pending
      })

      assert {:ok, _} = Social.unfollow_remote(user.id, actor.id)

      assert Repo.all(
        from r in Relationship,
          where: r.follower_id == ^user.id and r.remote_actor_id == ^actor.id
      ) == []
    end
  end
end
