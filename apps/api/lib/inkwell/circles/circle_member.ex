defmodule Inkwell.Circles.CircleMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "circle_members" do
    field :role, Ecto.Enum, values: [:owner, :moderator, :member], default: :member

    belongs_to :circle, Inkwell.Circles.Circle
    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(member, attrs) do
    member
    |> cast(attrs, [:circle_id, :user_id, :role])
    |> validate_required([:circle_id, :user_id, :role])
    |> unique_constraint([:circle_id, :user_id])
  end
end
