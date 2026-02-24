defmodule Inkwell.Repo.Migrations.AddTriageFieldsToFeedbackPosts do
  use Ecto.Migration

  def change do
    alter table(:feedback_posts) do
      add :priority, :string, default: nil
      add :value_score, :integer, default: nil
    end
  end
end
