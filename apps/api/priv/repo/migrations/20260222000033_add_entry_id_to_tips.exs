defmodule Inkwell.Repo.Migrations.AddEntryIdToTips do
  use Ecto.Migration

  def change do
    alter table(:tips) do
      add :entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:tips, [:entry_id])
  end
end
