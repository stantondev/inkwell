defmodule Inkwell.Social.TopFriend do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "top_friends" do
    field :position, :integer

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :friend, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(top_friend, attrs) do
    top_friend
    |> cast(attrs, [:user_id, :friend_id, :position])
    |> validate_required([:user_id, :friend_id, :position])
    |> validate_inclusion(:position, 1..6)
    |> unique_constraint([:user_id, :position])
  end
end
