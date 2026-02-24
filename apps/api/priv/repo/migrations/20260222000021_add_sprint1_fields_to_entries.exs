defmodule Inkwell.Repo.Migrations.AddSprint1FieldsToEntries do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      add :word_count, :integer, default: 0, null: false
      add :excerpt, :text
      add :cover_image_id, :uuid, null: true
    end

    create index(:entries, [:cover_image_id])
  end
end
