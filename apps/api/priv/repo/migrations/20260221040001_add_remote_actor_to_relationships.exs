defmodule Inkwell.Repo.Migrations.AddRemoteActorToRelationships do
  use Ecto.Migration

  def change do
    alter table(:relationships) do
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all),
        null: true
    end

    # Make follower_id nullable for remote follows (remote actor follows local user)
    # The remote_actor_id will be set instead
    alter table(:relationships) do
      modify :follower_id, :binary_id, null: true
    end

    create index(:relationships, [:remote_actor_id])
  end
end
