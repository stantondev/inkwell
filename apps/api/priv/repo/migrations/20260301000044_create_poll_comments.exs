defmodule Inkwell.Repo.Migrations.CreatePollComments do
  use Ecto.Migration

  def change do
    create table(:poll_comments, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :body, :text, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :poll_id, references(:polls, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:poll_comments, [:poll_id])
    create index(:poll_comments, [:user_id])

    alter table(:polls) do
      add :comment_count, :integer, null: false, default: 0
    end
  end
end
