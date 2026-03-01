defmodule Inkwell.Repo.Migrations.AddSensitiveContentFields do
  use Ecto.Migration

  def change do
    # Add sensitivity fields to local entries
    alter table(:entries) do
      add :sensitive, :boolean, default: false, null: false
      add :content_warning, :string, size: 200
      add :admin_sensitive, :boolean, default: false, null: false
    end

    # Add sensitivity fields to remote (federated) entries
    alter table(:remote_entries) do
      add :sensitive, :boolean, default: false, null: false
      add :content_warning, :string
    end

    # Reports table for user-submitted content reports
    create table(:reports, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :reporter_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all)
      add :reason, :string, null: false
      add :details, :text
      add :status, :string, default: "pending", null: false
      add :admin_notes, :text
      add :resolved_by, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :resolved_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:reports, [:reporter_id])
    create index(:reports, [:entry_id])
    create index(:reports, [:status])
    create unique_index(:reports, [:reporter_id, :entry_id])
  end
end
