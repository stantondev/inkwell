defmodule Inkwell.Repo.Migrations.CreateInks do
  use Ecto.Migration

  def change do
    create table(:inks, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:inks, [:user_id, :entry_id])
    create index(:inks, [:entry_id])

    alter table(:entries) do
      add :ink_count, :integer, default: 0, null: false
    end
  end
end
