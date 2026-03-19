defmodule Inkwell.Moderation.BlockedRemoteActor do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "blocked_remote_actors" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(block, attrs) do
    block
    |> cast(attrs, [:user_id, :remote_actor_id])
    |> validate_required([:user_id, :remote_actor_id])
    |> unique_constraint([:user_id, :remote_actor_id])
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:remote_actor_id)
  end
end
