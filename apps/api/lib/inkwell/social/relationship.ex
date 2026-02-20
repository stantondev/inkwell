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

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(relationship, attrs) do
    relationship
    |> cast(attrs, [:follower_id, :following_id, :status, :is_mutual])
    |> validate_required([:follower_id, :following_id, :status])
    |> validate_not_self_follow()
    |> unique_constraint([:follower_id, :following_id])
  end

  defp validate_not_self_follow(changeset) do
    follower = get_field(changeset, :follower_id)
    following = get_field(changeset, :following_id)

    if follower && follower == following do
      add_error(changeset, :following_id, "cannot follow yourself")
    else
      changeset
    end
  end
end
