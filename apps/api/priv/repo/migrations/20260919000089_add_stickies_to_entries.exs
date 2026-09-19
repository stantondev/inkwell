defmodule Inkwell.Repo.Migrations.AddStickiesToEntries do
  use Ecto.Migration

  # Stickies are short posts (no title, 500 characters) stored as entries so
  # privacy, blocking, moderation, comments, inks, stamps, search and export all
  # apply to them unchanged. `kind` tells them apart; `sticky_color` is the
  # paper color; an entry written from a sticky points back at it through
  # `source_sticky_id`.
  def change do
    alter table(:entries) do
      add :kind, :string, null: false, default: "entry"
      add :sticky_color, :string
      add :source_sticky_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:entries, [:user_id, :kind, :published_at])
    create index(:entries, [:source_sticky_id], where: "source_sticky_id IS NOT NULL")
  end
end
