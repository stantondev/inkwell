defmodule Inkwell.Stamps.Stamp do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @stamp_types [:felt, :holding_space, :beautifully_said, :rooting, :throwback, :i_cannot, :supporter]

  schema "stamps" do
    field :stamp_type, Ecto.Enum, values: @stamp_types

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def stamp_types, do: @stamp_types

  def changeset(stamp, attrs) do
    stamp
    |> cast(attrs, [:stamp_type, :entry_id, :user_id])
    |> validate_required([:stamp_type, :entry_id, :user_id])
    |> unique_constraint([:user_id, :entry_id])
  end
end
