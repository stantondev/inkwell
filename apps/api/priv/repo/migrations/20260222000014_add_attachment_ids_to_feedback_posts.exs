defmodule Inkwell.Repo.Migrations.AddAttachmentIdsToFeedbackPosts do
  use Ecto.Migration

  def change do
    alter table(:feedback_posts) do
      add :attachment_ids, {:array, :string}, default: []
    end
  end
end
