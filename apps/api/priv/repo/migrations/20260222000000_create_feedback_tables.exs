defmodule Inkwell.Repo.Migrations.CreateFeedbackTables do
  use Ecto.Migration

  def change do
    # Feedback posts — the main board items
    create table(:feedback_posts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :title, :string, null: false
      add :body, :text, null: false
      add :category, :string, null: false, default: "idea"
      add :status, :string, null: false, default: "new"
      add :admin_response, :text
      add :vote_count, :integer, null: false, default: 0
      add :comment_count, :integer, null: false, default: 0
      add :user_id, references(:users, type: :binary_id, on_delete: :nilify_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:feedback_posts, [:user_id])
    create index(:feedback_posts, [:category])
    create index(:feedback_posts, [:status])
    create index(:feedback_posts, [:vote_count])
    create index(:feedback_posts, [:inserted_at])

    # Feedback votes — one per user per post
    create table(:feedback_votes, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :feedback_post_id, references(:feedback_posts, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:feedback_votes, [:user_id, :feedback_post_id])
    create index(:feedback_votes, [:feedback_post_id])

    # Feedback comments — threaded discussion on posts
    create table(:feedback_comments, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :body, :text, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :nilify_all), null: false
      add :feedback_post_id, references(:feedback_posts, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:feedback_comments, [:feedback_post_id, :inserted_at])
    create index(:feedback_comments, [:user_id])
  end
end
