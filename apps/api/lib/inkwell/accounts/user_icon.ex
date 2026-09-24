defmodule Inkwell.Accounts.UserIcon do
  @moduledoc "A userpic: one of a writer's pictures, with a keyword. See Inkwell.Userpics."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_icons" do
    # Only rows from before userpics were stored here; new ones use `data`.
    field :image_url, :string
    field :data, :string, redact: true
    field :content_type, :string
    field :keyword, :string
    field :is_default, :boolean, default: false
    field :sort_order, :integer, default: 0

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(icon, attrs) do
    icon
    |> cast(attrs, [:data, :content_type, :keyword, :sort_order, :user_id])
    |> update_change(:keyword, &String.trim/1)
    |> validate_required([:keyword, :user_id])
    |> validate_length(:keyword, max: 50)
    |> unique_constraint(:keyword, name: :user_icons_user_keyword_index, message: "is already used by another of your userpics")
  end
end
