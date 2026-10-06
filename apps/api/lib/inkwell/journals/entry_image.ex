defmodule Inkwell.Journals.EntryImage do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # The file lives either in object storage (`storage_key`) or here as a
  # base64 data URI (`data`): see Inkwell.Images. Rows moved to object
  # storage keep `data` for a while as a way back.
  schema "entry_images" do
    field :data, :string
    field :storage_key, :string
    field :content_type, :string
    field :filename, :string
    field :byte_size, :integer

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(image, attrs) do
    image
    |> cast(attrs, [:data, :storage_key, :content_type, :filename, :byte_size, :user_id])
    |> validate_required([:content_type, :user_id])
    |> validate_file_present()
    |> check_constraint(:data, name: :entry_images_data_or_storage_key)
  end

  defp validate_file_present(changeset) do
    if get_field(changeset, :data) || get_field(changeset, :storage_key) do
      changeset
    else
      add_error(changeset, :data, "can't be blank")
    end
  end
end
