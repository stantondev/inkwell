defmodule Inkwell.Repo.Migrations.CreatePushDevices do
  use Ecto.Migration

  # Phones running the Inkwell app (apps/mobile), reached through Firebase
  # Cloud Messaging. Tied to the sign-in session that registered them, so
  # signing out (which deletes that auth token) stops the notifications.
  def change do
    create table(:push_devices, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :auth_token_id, references(:auth_tokens, type: :binary_id, on_delete: :delete_all)
      add :token, :text, null: false
      add :platform, :string, null: false, default: "android"
      add :app_version, :string

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:push_devices, [:token])
    create index(:push_devices, [:user_id])
    create index(:push_devices, [:auth_token_id])
  end
end
