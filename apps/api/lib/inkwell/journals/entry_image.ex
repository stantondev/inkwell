defmodule Inkwell.Journals.EntryImage do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "entry_images" do
    field :data, :string
    field :content_type, :string
    field :filename, :string
    field :byte_size, :integer

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(image, attrs) do
    image
    |> cast(attrs, [:data, :content_type, :filename, :byte_size, :user_id])
    |> validate_required([:data, :content_type, :user_id])
  end
end
