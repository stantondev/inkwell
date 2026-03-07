defmodule Inkwell.Repo.Migrations.CreateRelaySubscriptions do
  use Ecto.Migration

  def change do
    create table(:relay_subscriptions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :relay_url, :string, null: false
      add :relay_inbox, :string, null: false
      add :relay_domain, :string, null: false
      add :status, :string, null: false, default: "pending"
      add :content_filter, :map, default: %{}
      add :entry_count, :integer, default: 0
      add :last_activity_at, :utc_datetime_usec
      add :error_message, :string
      add :instance_actor_id, references(:users, type: :binary_id, on_delete: :nothing), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:relay_subscriptions, [:relay_url])
    create index(:relay_subscriptions, [:status])

    alter table(:remote_entries) do
      add :source, :string
      add :relay_subscription_id, references(:relay_subscriptions, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:remote_entries, [:source])
    create index(:remote_entries, [:relay_subscription_id])
  end
end
