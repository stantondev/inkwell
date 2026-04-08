defmodule Inkwell.Repo.Migrations.CreateWebhookDeliveries do
  use Ecto.Migration

  def change do
    create table(:webhook_deliveries, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :source, :string, null: false
      add :event_type, :string
      add :status, :string, null: false
      add :signature_valid, :boolean
      add :remote_ip, :string
      add :body_size, :integer
      add :error, :text

      timestamps(updated_at: false)
    end

    create index(:webhook_deliveries, [:source, :inserted_at])
    create index(:webhook_deliveries, [:status])
  end
end
