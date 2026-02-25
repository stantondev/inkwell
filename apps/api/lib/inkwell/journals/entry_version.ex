defmodule Inkwell.Journals.EntryVersion do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "entry_versions" do
    field :version_number, :integer
    field :title, :string
    field :body_html, :string
    field :body_raw, :map
    field :word_count, :integer, default: 0
    field :excerpt, :string
    field :mood, :string
    field :tags, {:array, :string}, default: []
    field :category, :string
    field :cover_image_id, :binary_id

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(version, attrs) do
    version
    |> cast(attrs, [
      :entry_id, :user_id, :version_number, :title, :body_html, :body_raw,
      :word_count, :excerpt, :mood, :tags, :category, :cover_image_id
    ])
    |> validate_required([:entry_id, :user_id, :version_number])
  end
end
