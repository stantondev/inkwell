defmodule Inkwell.Inks.Ink do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "inks" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema
    field :ap_like_id, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(ink, attrs) do
    ink
    |> cast(attrs, [:user_id, :entry_id, :remote_actor_id, :ap_like_id])
    |> validate_required([:entry_id])
    |> validate_actor_present()
    |> unique_constraint([:user_id, :entry_id])
    |> unique_constraint([:remote_actor_id, :entry_id], name: :inks_remote_actor_id_entry_id_index)
  end

  defp validate_actor_present(changeset) do
    user_id = get_field(changeset, :user_id)
    remote_actor_id = get_field(changeset, :remote_actor_id)

    cond do
      is_nil(user_id) and is_nil(remote_actor_id) ->
        add_error(changeset, :user_id, "either user_id or remote_actor_id must be present")

      not is_nil(user_id) and not is_nil(remote_actor_id) ->
        add_error(changeset, :user_id, "cannot set both user_id and remote_actor_id")

      true ->
        changeset
    end
  end
end
