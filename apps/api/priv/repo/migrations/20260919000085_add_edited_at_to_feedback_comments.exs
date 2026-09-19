defmodule Inkwell.Repo.Migrations.AddEditedAtToFeedbackComments do
  use Ecto.Migration

  def change do
    alter table(:feedback_comments) do
      add :edited_at, :utc_datetime_usec
    end
  end
end
