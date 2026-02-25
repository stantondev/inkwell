defmodule Inkwell.Repo.Migrations.CreateEntryVersions do
  use Ecto.Migration

  def change do
    create table(:entry_versions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :version_number, :integer, null: false
      add :title, :text
      add :body_html, :text
      add :body_raw, :map
      add :word_count, :integer, default: 0
      add :excerpt, :text
      add :mood, :string
      add :tags, {:array, :text}, default: []
      add :category, :string
      add :cover_image_id, :binary_id

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:entry_versions, [:entry_id, :version_number])
    create index(:entry_versions, [:entry_id, :inserted_at])
  end
end
