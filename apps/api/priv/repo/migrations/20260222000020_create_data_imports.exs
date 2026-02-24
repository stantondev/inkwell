defmodule Inkwell.Repo.Migrations.CreateDataImports do
  use Ecto.Migration

  def change do
    create table(:data_imports, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :status, :string, null: false, default: "pending"
      add :format, :string, null: false
      add :import_mode, :string, null: false, default: "draft"
      add :default_privacy, :string, null: false, default: "private"
      add :file_data, :binary
      add :file_name, :string
      add :file_size, :integer
      add :total_entries, :integer, default: 0
      add :imported_count, :integer, default: 0
      add :skipped_count, :integer, default: 0
      add :error_count, :integer, default: 0
      add :errors, {:array, :map}, default: []
      add :error_message, :string
      add :completed_at, :utc_datetime_usec
      add :expires_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:data_imports, [:user_id])
    create index(:data_imports, [:expires_at])
  end
end
