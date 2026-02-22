defmodule Inkwell.Repo.Migrations.AllowNullUserOnFeedback do
  use Ecto.Migration

  def change do
    # Allow user_id to be NULL on feedback posts and comments
    # so that on_delete: :nilify_all works correctly when a user is deleted.
    # The posts/comments are preserved anonymously.
    alter table(:feedback_posts) do
      modify :user_id, :binary_id, null: true
    end

    alter table(:feedback_comments) do
      modify :user_id, :binary_id, null: true
    end
  end
end
