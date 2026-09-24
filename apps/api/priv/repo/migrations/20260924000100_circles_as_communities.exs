defmodule Inkwell.Repo.Migrations.CirclesAsCommunities do
  use Ecto.Migration

  # Circles become LiveJournal-style communities: members post ordinary
  # entries "to" a circle. An entry keeps living on its writer's journal; the
  # circle page and members' Feeds show it too. `privacy: "circle"` (entries.privacy
  # is a plain string) limits an entry to the circle's members.
  def change do
    alter table(:entries) do
      add :circle_id, references(:circles, type: :binary_id, on_delete: :nilify_all)
      # The prompt this entry answers (another entry in the same circle).
      add :circle_prompt_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:entries, [:circle_id, :published_at], where: "circle_id IS NOT NULL")
    create index(:entries, [:circle_prompt_id], where: "circle_prompt_id IS NOT NULL")

    alter table(:circles) do
      # The circle's current prompt: an entry the owner or a moderator pinned.
      add :prompt_entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
    end

    alter table(:circle_members) do
      # For "N new" on Your circles.
      add :last_read_at, :utc_datetime_usec
    end
  end
end
