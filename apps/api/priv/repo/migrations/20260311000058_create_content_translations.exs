defmodule Inkwell.Repo.Migrations.CreateContentTranslations do
  use Ecto.Migration

  def change do
    create table(:content_translations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :translatable_type, :string, null: false
      add :translatable_id, :binary_id, null: false
      add :source_language, :string, size: 10
      add :target_language, :string, size: 10, null: false
      add :translated_title, :text
      add :translated_body, :text, null: false
      add :provider, :string, default: "deepl"

      timestamps()
    end

    create unique_index(:content_translations, [:translatable_type, :translatable_id, :target_language])
    create index(:content_translations, [:translatable_type, :translatable_id])

    # Add preferred_language to users
    alter table(:users) do
      add :preferred_language, :string
    end
  end
end
