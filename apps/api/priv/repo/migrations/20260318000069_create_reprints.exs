defmodule Inkwell.Repo.Migrations.CreateReprints do
  use Ecto.Migration

  def change do
    create table(:reprints, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all)
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all)
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all)
      add :remote_entry_id, references(:remote_entries, type: :binary_id, on_delete: :delete_all)
      add :ap_announce_id, :string

      timestamps(type: :utc_datetime_usec)
    end

    # Local user reprinting local entry
    create unique_index(:reprints, [:user_id, :entry_id],
      where: "user_id IS NOT NULL AND entry_id IS NOT NULL"
    )

    # Local user reprinting remote entry
    create unique_index(:reprints, [:user_id, :remote_entry_id],
      where: "user_id IS NOT NULL AND remote_entry_id IS NOT NULL"
    )

    # Remote actor reprinting local entry
    create unique_index(:reprints, [:remote_actor_id, :entry_id],
      where: "remote_actor_id IS NOT NULL AND entry_id IS NOT NULL"
    )

    # Remote actor reprinting remote entry
    create unique_index(:reprints, [:remote_actor_id, :remote_entry_id],
      where: "remote_actor_id IS NOT NULL AND remote_entry_id IS NOT NULL"
    )

    create index(:reprints, [:user_id])
    create index(:reprints, [:entry_id])
    create index(:reprints, [:remote_entry_id])
    create index(:reprints, [:inserted_at])

    # Denormalized reprint counts
    alter table(:entries) do
      add :reprint_count, :integer, default: 0, null: false
    end

    alter table(:remote_entries) do
      add :reprint_count, :integer, default: 0, null: false
    end
  end
end
