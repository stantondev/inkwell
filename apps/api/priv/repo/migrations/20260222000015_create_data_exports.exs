defmodule Inkwell.Repo.Migrations.CreateDataExports do
  use Ecto.Migration

  def change do
    create table(:data_exports, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :status, :string, null: false, default: "pending"
      add :data, :binary
      add :file_size, :integer
      add :error_message, :string
      add :expires_at, :utc_datetime_usec
      add :completed_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:data_exports, [:user_id])
    create index(:data_exports, [:expires_at])
  end
end
