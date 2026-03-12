defmodule Inkwell.Social do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Social.{Relationship, FriendFilter, TopFriend}
  alias Inkwell.Federation.RemoteActorSchema

  # Relationships

  def follow(follower_id, following_id) do
    %Relationship{}
    |> Relationship.changeset(%{
      follower_id: follower_id,
      following_id: following_id,
      status: :pending
    })
    |> Repo.insert()
  end

  def accept_follow(follower_id, following_id) do
    with {:ok, rel} <- get_relationship(follower_id, following_id) do
      # Accept the incoming follow
      rel
      |> Relationship.changeset(%{status: :accepted, is_mutual: true})
      |> Repo.update()
      |> tap(fn {:ok, _} ->
        # Auto-follow back to create a mutual pen pal connection
        case get_relationship(following_id, follower_id) do
          {:ok, rev} ->
            # Reverse already exists — make sure it's accepted + mutual
            rev |> Relationship.changeset(%{status: :accepted, is_mutual: true}) |> Repo.update()

          {:error, :not_found} ->
            # Create a reverse follow (auto-accepted, mutual)
            %Relationship{}
            |> Relationship.changeset(%{
              follower_id: following_id,
              following_id: follower_id,
              status: :accepted,
              is_mutual: true
            })
            |> Repo.insert()
        end
      end)
    end
  end

  def unfollow(follower_id, following_id) do
    case get_relationship(follower_id, following_id) do
      {:ok, rel} ->
        # If mutual, update the reverse relationship
        if rel.is_mutual do
          case get_relationship(following_id, follower_id) do
            {:ok, rev} -> rev |> Relationship.changeset(%{is_mutual: false}) |> Repo.update()
            _ -> :ok
          end
        end
        Repo.delete(rel)
      error -> error
    end
  end

  def block(blocker_id, blocked_id) do
    # Remove any existing relationships
    Relationship
    |> where([r], (r.follower_id == ^blocker_id and r.following_id == ^blocked_id) or
                   (r.follower_id == ^blocked_id and r.following_id == ^blocker_id))
    |> Repo.delete_all()

    # Delete stamps between the two users (both directions)
    entry_ids_by_blocker =
      from(e in Inkwell.Journals.Entry, where: e.user_id == ^blocker_id, select: e.id)

    entry_ids_by_blocked =
      from(e in Inkwell.Journals.Entry, where: e.user_id == ^blocked_id, select: e.id)

    Inkwell.Stamps.Stamp
    |> where([s], s.user_id == ^blocker_id and s.entry_id in subquery(entry_ids_by_blocked))
    |> Repo.delete_all()

    Inkwell.Stamps.Stamp
    |> where([s], s.user_id == ^blocked_id and s.entry_id in subquery(entry_ids_by_blocker))
    |> Repo.delete_all()

    # Delete inks between the two users (both directions)
    Inkwell.Inks.Ink
    |> where([i], i.user_id == ^blocker_id and i.entry_id in subquery(entry_ids_by_blocked))
    |> Repo.delete_all()

    Inkwell.Inks.Ink
    |> where([i], i.user_id == ^blocked_id and i.entry_id in subquery(entry_ids_by_blocker))
    |> Repo.delete_all()

    # Remove from top friends (both directions)
    TopFriend
    |> where([tf],
      (tf.user_id == ^blocker_id and tf.friend_id == ^blocked_id) or
      (tf.user_id == ^blocked_id and tf.friend_id == ^blocker_id)
    )
    |> Repo.delete_all()

    # Create block
    %Relationship{}
    |> Relationship.changeset(%{
      follower_id: blocker_id,
      following_id: blocked_id,
      status: :blocked
    })
    |> Repo.insert()
  end

  def unblock(blocker_id, blocked_id) do
    {count, _} =
      Relationship
      |> where([r], r.follower_id == ^blocker_id and r.following_id == ^blocked_id and r.status == :blocked)
      |> Repo.delete_all()

    case count do
      0 -> {:error, :not_found}
      _ -> :ok
    end
  end

  @doc "Check if either user has blocked the other (bidirectional)."
  def is_blocked_between?(user_a_id, user_b_id) do
    Relationship
    |> where([r],
      (r.follower_id == ^user_a_id and r.following_id == ^user_b_id and r.status == :blocked) or
      (r.follower_id == ^user_b_id and r.following_id == ^user_a_id and r.status == :blocked)
    )
    |> Repo.exists?()
  end

  @doc "Get all user IDs blocked in both directions (users I blocked + users who blocked me)."
  def get_blocked_user_ids(user_id) do
    blocked_by_me =
      Relationship
      |> where([r], r.follower_id == ^user_id and r.status == :blocked)
      |> select([r], r.following_id)
      |> Repo.all()

    blocked_me =
      Relationship
      |> where([r], r.following_id == ^user_id and r.status == :blocked)
      |> select([r], r.follower_id)
      |> Repo.all()

    Enum.uniq(blocked_by_me ++ blocked_me)
  end

  @doc "Get directional block status between two users."
  def get_block_status(viewer_id, target_id) do
    blocked_by_me =
      Relationship
      |> where([r], r.follower_id == ^viewer_id and r.following_id == ^target_id and r.status == :blocked)
      |> Repo.exists?()

    blocked_by_them =
      Relationship
      |> where([r], r.follower_id == ^target_id and r.following_id == ^viewer_id and r.status == :blocked)
      |> Repo.exists?()

    case {blocked_by_me, blocked_by_them} do
      {true, true} -> :mutual_block
      {true, false} -> :blocked_by_me
      {false, true} -> :blocked_by_them
      {false, false} -> nil
    end
  end

  @doc "List users that the given user has blocked."
  def list_blocked_users(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :blocked)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.following_id == u.id)
    |> select([r, u], u)
    |> order_by([r], desc: r.inserted_at)
    |> Repo.all()
  end

  def get_relationship(follower_id, following_id) do
    case Repo.get_by(Relationship, follower_id: follower_id, following_id: following_id) do
      nil -> {:error, :not_found}
      rel -> {:ok, rel}
    end
  end

  def list_friends(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.following_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  def list_friend_ids(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted)
    |> select([r], r.following_id)
    |> Repo.all()
  end

  def list_followers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.follower_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  def list_pending_follow_requests(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :pending)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.follower_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  # Outgoing pending requests (people you've requested but haven't accepted yet)
  def list_pending_following(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :pending)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.following_id == u.id)
    |> select([r, u], u)
    |> order_by([r], desc: r.inserted_at)
    |> Repo.all()
  end

  def reject_follow(follower_id, following_id) do
    case get_relationship(follower_id, following_id) do
      {:ok, %{status: :pending} = rel} -> Repo.delete(rel)
      {:ok, _} -> {:error, :not_pending}
      error -> error
    end
  end

  # Pen Pals = mutual follows (is_mutual: true)
  def list_pen_pals(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted and r.is_mutual == true)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.following_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  # Readers = people following you (accepted, but you don't follow them back)
  def list_readers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted and r.is_mutual == false)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.follower_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  # Reading = people you follow (accepted, but they don't follow you back)
  def list_reading(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted and r.is_mutual == false)
    |> join(:inner, [r], u in Inkwell.Accounts.User, on: r.following_id == u.id)
    |> select([r, u], u)
    |> Repo.all()
  end

  def count_followers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted)
    |> Repo.aggregate(:count)
  end

  def count_following(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted)
    |> Repo.aggregate(:count)
  end

  # Pen pals = mutual follows (both follow each other)
  def count_pen_pals(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted and r.is_mutual == true)
    |> Repo.aggregate(:count)
  end

  # Readers = people following you who you haven't followed back
  def count_readers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted and r.is_mutual == false)
    |> Repo.aggregate(:count)
  end

  # Fediverse followers = remote actors that follow this user
  def list_fediverse_followers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
    |> join(:inner, [r], ra in RemoteActorSchema, on: r.remote_actor_id == ra.id)
    |> select([r, ra], ra)
    |> order_by([r, ra], asc: ra.domain, asc: ra.username)
    |> Repo.all()
  end

  # Fediverse following = remote actors that this user follows
  def list_fediverse_following(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
    |> join(:inner, [r], ra in RemoteActorSchema, on: r.remote_actor_id == ra.id)
    |> select([r, ra], ra)
    |> order_by([r, ra], asc: ra.domain, asc: ra.username)
    |> Repo.all()
  end

  def get_fediverse_following_back_ids(user_id, actors) do
    actor_ids = Enum.map(actors, & &1.id)

    following_ids =
      Relationship
      |> where([r], r.follower_id == ^user_id and r.remote_actor_id in ^actor_ids and r.status in [:pending, :accepted])
      |> select([r], r.remote_actor_id)
      |> Repo.all()

    MapSet.new(following_ids)
  end

  def count_fediverse_followers(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
    |> Repo.aggregate(:count)
  end

  def count_fediverse_following(user_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
    |> Repo.aggregate(:count)
  end

  def is_friend?(user_id, other_id) do
    Relationship
    |> where([r], r.follower_id == ^user_id and r.following_id == ^other_id and r.status == :accepted)
    |> Repo.exists?()
  end

  # Friend Filters

  def list_friend_filters(user_id) do
    FriendFilter
    |> where(user_id: ^user_id)
    |> order_by(:name)
    |> Repo.all()
  end

  def create_friend_filter(attrs) do
    %FriendFilter{}
    |> FriendFilter.changeset(attrs)
    |> Repo.insert()
  end

  def update_friend_filter(%FriendFilter{} = filter, attrs) do
    filter
    |> FriendFilter.changeset(attrs)
    |> Repo.update()
  end

  def delete_friend_filter(%FriendFilter{} = filter) do
    Repo.delete(filter)
  end

  # Top Friends

  def list_top_friends(user_id) do
    TopFriend
    |> where(user_id: ^user_id)
    |> order_by(:position)
    |> join(:inner, [tf], u in Inkwell.Accounts.User, on: tf.friend_id == u.id)
    |> select([tf, u], {tf.position, u})
    |> Repo.all()
  end

  def update_top_friends(user_id, friends) do
    Repo.transaction(fn ->
      # Delete existing
      TopFriend |> where(user_id: ^user_id) |> Repo.delete_all()

      # Insert new (handle both string and atom keys from JSON params)
      Enum.each(friends, fn entry ->
        friend_id = entry["friend_id"] || entry[:friend_id]
        position = entry["position"] || entry[:position]

        %TopFriend{}
        |> TopFriend.changeset(%{user_id: user_id, friend_id: friend_id, position: position})
        |> Repo.insert!()
      end)
    end)
  end
end
