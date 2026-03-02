defmodule Inkwell.Repo.Migrations.AddRemoteEntryIdToInks do
  use Ecto.Migration

  def change do
    alter table(:inks) do
      add :remote_entry_id, references(:remote_entries, type: :binary_id, on_delete: :delete_all)
    end

    # Make entry_id nullable (was required before; now exactly one of entry_id/remote_entry_id must be set)
    execute "ALTER TABLE inks ALTER COLUMN entry_id DROP NOT NULL",
            "ALTER TABLE inks ALTER COLUMN entry_id SET NOT NULL"

    create unique_index(:inks, [:user_id, :remote_entry_id])
  end
end
