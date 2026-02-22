defmodule Inkwell.Accounts.Notification do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "notifications" do
    field :type, Ecto.Enum, values: [:comment, :follow_request, :follow_accepted, :mention, :community_invite, :tip, :like, :stamp]
    field :target_type, :string
    field :target_id, :binary_id
    field :read, :boolean, default: false
    field :data, :map, default: %{}

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :actor, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(notification, attrs) do
    notification
    |> cast(attrs, [:type, :user_id, :actor_id, :target_type, :target_id, :read, :data])
    |> validate_required([:type, :user_id])
  end
end
