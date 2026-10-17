defmodule Inkwell.Repo.Migrations.StampsOverhaul do
  use Ecto.Migration

  # Stamps become postage a reader sends a writer: an optional private note,
  # and stamps from fediverse accounts (emoji reactions) arrive as "postage
  # from abroad" with the sender's own emoji.
  def change do
    alter table(:stamps) do
      add :note, :string, size: 280
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all)
      add :emoji, :string, size: 120
      add :emoji_url, :text
      add :ap_id, :text
      modify :user_id, :binary_id, null: true, from: {:binary_id, null: false}
    end

    create constraint(:stamps, :stamps_one_sender,
             check: "(user_id IS NOT NULL AND remote_actor_id IS NULL) OR (user_id IS NULL AND remote_actor_id IS NOT NULL)"
           )

    create unique_index(:stamps, [:remote_actor_id, :entry_id],
             where: "remote_actor_id IS NOT NULL",
             name: :stamps_remote_actor_id_entry_id_index
           )

    create unique_index(:stamps, [:ap_id], where: "ap_id IS NOT NULL", name: :stamps_ap_id_index)

    # The writer's album: stamps on a writer's entries, newest first.
    create index(:stamps, [:entry_id, :inserted_at])
  end
end
