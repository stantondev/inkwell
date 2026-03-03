defmodule Inkwell.Stamps.Stamp do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @stamp_types [:felt, :holding_space, :beautifully_said, :rooting, :throwback, :i_cannot, :first_class]

  schema "stamps" do
    field :stamp_type, Ecto.Enum, values: @stamp_types

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :remote_entry, Inkwell.Federation.RemoteEntry
    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def stamp_types, do: @stamp_types

  def changeset(stamp, attrs) do
    stamp
    |> cast(attrs, [:stamp_type, :entry_id, :remote_entry_id, :user_id])
    |> validate_required([:stamp_type, :user_id])
    |> validate_entry_target()
    |> unique_constraint([:user_id, :entry_id])
    |> unique_constraint([:user_id, :remote_entry_id])
  end

  defp validate_entry_target(changeset) do
    entry_id = get_field(changeset, :entry_id)
    remote_entry_id = get_field(changeset, :remote_entry_id)

    cond do
      is_nil(entry_id) and is_nil(remote_entry_id) ->
        add_error(changeset, :entry_id, "either entry_id or remote_entry_id must be present")

      not is_nil(entry_id) and not is_nil(remote_entry_id) ->
        add_error(changeset, :entry_id, "cannot set both entry_id and remote_entry_id")

      true ->
        changeset
    end
  end
end
