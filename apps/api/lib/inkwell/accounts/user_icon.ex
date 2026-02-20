defmodule Inkwell.Accounts.UserIcon do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_icons" do
    field :image_url, :string
    field :keyword, :string
    field :is_default, :boolean, default: false
    field :sort_order, :integer, default: 0

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(icon, attrs) do
    icon
    |> cast(attrs, [:image_url, :keyword, :is_default, :sort_order, :user_id])
    |> validate_required([:image_url, :keyword, :user_id])
    |> validate_length(:keyword, max: 50)
  end
end
