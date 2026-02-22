defmodule Inkwell.Repo.Migrations.CreateStamps do
  use Ecto.Migration

  def change do
    create table(:stamps, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :stamp_type, :string, null: false
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:stamps, [:user_id, :entry_id])
    create index(:stamps, [:entry_id])
  end
end
