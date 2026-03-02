defmodule Inkwell.Repo.Migrations.AddRemoteActorToInks do
  use Ecto.Migration

  def change do
    alter table(:inks) do
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all)
      add :ap_like_id, :text
    end

    # Make user_id nullable — remote inks have no local user
    execute "ALTER TABLE inks ALTER COLUMN user_id DROP NOT NULL",
            "ALTER TABLE inks ALTER COLUMN user_id SET NOT NULL"

    # One ink per remote actor per entry
    create unique_index(:inks, [:remote_actor_id, :entry_id],
      where: "remote_actor_id IS NOT NULL",
      name: :inks_remote_actor_id_entry_id_index
    )

    # For Undo { Like } matching by AP ID
    create index(:inks, [:ap_like_id],
      where: "ap_like_id IS NOT NULL",
      name: :inks_ap_like_id_index
    )
  end
end
