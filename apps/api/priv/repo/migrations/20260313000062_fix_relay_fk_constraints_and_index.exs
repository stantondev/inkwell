defmodule Inkwell.Repo.Migrations.FixRelayFkConstraintsAndIndex do
  use Ecto.Migration

  def change do
    # Fix 1: instance_actor_id FK — on_delete: :nothing → :delete_all
    # If the relay user is deleted, cascade-delete all subscriptions
    # Note: modify with from: handles dropping and recreating the constraint
    alter table(:relay_subscriptions) do
      modify :instance_actor_id, references(:users, type: :binary_id, on_delete: :delete_all),
        from: references(:users, type: :binary_id, on_delete: :nothing)
    end

    # Fix 2: relay_subscription_id FK — on_delete: :nilify_all → :delete_all
    # Matches the manual cascade deletion in Relays.unsubscribe/1
    alter table(:remote_entries) do
      modify :relay_subscription_id,
        references(:relay_subscriptions, type: :binary_id, on_delete: :delete_all),
        from: references(:relay_subscriptions, type: :binary_id, on_delete: :nilify_all)
    end

    # Fix 5: Composite index for cleanup worker performance
    # CleanupRelayContentWorker queries WHERE source = 'relay' AND inserted_at < cutoff
    create index(:remote_entries, [:source, :inserted_at])
  end
end
