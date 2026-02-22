defmodule Inkwell.Social do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Social.{Relationship, FriendFilter, TopFriend}

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

    # Create block
    %Relationship{}
    |> Relationship.changeset(%{
      follower_id: blocker_id,
      following_id: blocked_id,
      status: :blocked
    })
    |> Repo.insert()
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
