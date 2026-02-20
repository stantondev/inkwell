defmodule Inkwell.Social.FriendFilter do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "friend_filters" do
    field :name, :string
    field :member_ids, {:array, :binary_id}, default: []

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(filter, attrs) do
    filter
    |> cast(attrs, [:name, :member_ids, :user_id])
    |> validate_required([:name, :user_id])
    |> validate_length(:name, max: 100)
  end
end
