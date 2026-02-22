defmodule Inkwell.Social.Relationship do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "relationships" do
    field :status, Ecto.Enum, values: [:pending, :accepted, :blocked]
    field :is_mutual, :boolean, default: false

    belongs_to :follower, Inkwell.Accounts.User
    belongs_to :following, Inkwell.Accounts.User
    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(relationship, attrs) do
    relationship
    |> cast(attrs, [:follower_id, :following_id, :status, :is_mutual, :remote_actor_id])
    |> validate_required([:status])
    |> validate_has_follower()
    |> validate_has_following()
    |> validate_not_self_follow()
    |> unique_constraint([:follower_id, :following_id])
  end

  # Inbound side: must have either a local follower_id or a remote_actor_id
  defp validate_has_follower(changeset) do
    follower = get_field(changeset, :follower_id)
    remote = get_field(changeset, :remote_actor_id)

    if is_nil(follower) && is_nil(remote) do
      add_error(changeset, :follower_id, "must have either a local follower or remote actor")
    else
      changeset
    end
  end

  # Outbound side: must have either a local following_id or a remote_actor_id
  defp validate_has_following(changeset) do
    following = get_field(changeset, :following_id)
    remote = get_field(changeset, :remote_actor_id)

    if is_nil(following) && is_nil(remote) do
      add_error(changeset, :following_id, "must have either a local following or remote actor")
    else
      changeset
    end
  end

  defp validate_not_self_follow(changeset) do
    follower = get_field(changeset, :follower_id)
    following = get_field(changeset, :following_id)

    if follower && following && follower == following do
      add_error(changeset, :following_id, "cannot follow yourself")
    else
      changeset
    end
  end
end
