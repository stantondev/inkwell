defmodule Inkwell.Repo.Migrations.CreateWebhookEvents do
  use Ecto.Migration

  def change do
    create table(:webhook_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :event_id, :string, null: false
      add :event_type, :string, null: false
      add :status, :string, default: "processed", null: false

      timestamps(updated_at: false)
    end

    create unique_index(:webhook_events, [:event_id])
  end
end
