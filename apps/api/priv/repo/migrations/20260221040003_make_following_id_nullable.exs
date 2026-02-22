defmodule Inkwell.Repo.Migrations.MakeFollowingIdNullable do
  use Ecto.Migration

  def change do
    # Make following_id nullable for outbound remote follows
    # (when a local user follows a remote actor, there's no local following_id)
    alter table(:relationships) do
      modify :following_id, :binary_id, null: true, from: {:binary_id, null: false}
    end

    # Drop the existing unique index that includes following_id and recreate it
    # to handle null following_id cases
    drop_if_exists unique_index(:relationships, [:follower_id, :following_id])

    # Add a unique index for local-to-local follows
    create unique_index(:relationships, [:follower_id, :following_id],
      where: "following_id IS NOT NULL",
      name: :relationships_follower_following_unique)

    # Add a unique index for local-to-remote follows
    create unique_index(:relationships, [:follower_id, :remote_actor_id],
      where: "remote_actor_id IS NOT NULL",
      name: :relationships_follower_remote_actor_unique)
  end
end
