defmodule Inkwell.Translations.ContentTranslation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "content_translations" do
    field :translatable_type, :string
    field :translatable_id, :binary_id
    field :source_language, :string
    field :target_language, :string
    field :translated_title, :string
    field :translated_body, :string
    field :provider, :string, default: "deepl"

    timestamps()
  end

  def changeset(translation, attrs) do
    translation
    |> cast(attrs, [:translatable_type, :translatable_id, :source_language, :target_language, :translated_title, :translated_body, :provider])
    |> validate_required([:translatable_type, :translatable_id, :target_language, :translated_body])
    |> validate_inclusion(:translatable_type, ~w(entry comment remote_entry guestbook_entry circle_response))
    |> unique_constraint([:translatable_type, :translatable_id, :target_language])
  end
end
