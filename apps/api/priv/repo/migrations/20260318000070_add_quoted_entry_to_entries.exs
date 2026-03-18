defmodule Inkwell.Repo.Migrations.AddQuotedEntryToEntries do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      add :quoted_entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
      add :quoted_remote_entry_id, references(:remote_entries, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:entries, [:quoted_entry_id], where: "quoted_entry_id IS NOT NULL")
    create index(:entries, [:quoted_remote_entry_id], where: "quoted_remote_entry_id IS NOT NULL")
  end
end
