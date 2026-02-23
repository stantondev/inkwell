defmodule Inkwell.Repo.Migrations.AddRemoteEntryToStampsAndComments do
  use Ecto.Migration

  def change do
    # Allow stamps on remote entries
    alter table(:stamps) do
      add :remote_entry_id, references(:remote_entries, type: :binary_id, on_delete: :delete_all)
      modify :entry_id, :binary_id, null: true
    end

    create unique_index(:stamps, [:user_id, :remote_entry_id],
      where: "remote_entry_id IS NOT NULL",
      name: :stamps_user_id_remote_entry_id_index
    )

    create index(:stamps, [:remote_entry_id])

    # Allow comments on remote entries
    alter table(:comments) do
      add :remote_entry_id, references(:remote_entries, type: :binary_id, on_delete: :delete_all)
      modify :entry_id, :binary_id, null: true
    end

    create index(:comments, [:remote_entry_id])
  end
end
