defmodule Inkwell.Repo.Migrations.AddReleaseNoteToFeedbackPosts do
  use Ecto.Migration

  def change do
    alter table(:feedback_posts) do
      add :release_note, :text
      add :completed_at, :utc_datetime_usec
    end

    create index(:feedback_posts, [:completed_at])
  end
end
