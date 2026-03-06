defmodule Inkwell.Repo.Migrations.CreateCircles do
  use Ecto.Migration

  def change do
    create table(:circles, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :slug, :string, null: false
      add :description, :text
      add :category, :string, null: false
      add :cover_image_id, references(:entry_images, on_delete: :nilify_all, type: :binary_id)
      add :owner_id, references(:users, on_delete: :nilify_all, type: :binary_id)
      add :member_count, :integer, null: false, default: 0
      add :discussion_count, :integer, null: false, default: 0
      add :visibility, :string, null: false, default: "public"
      add :is_starter, :boolean, null: false, default: false
      add :last_activity_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:circles, [:slug])
    create index(:circles, [:category])
    create index(:circles, [:owner_id])
    create index(:circles, [:last_activity_at])

    create table(:circle_members, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :circle_id, references(:circles, on_delete: :delete_all, type: :binary_id), null: false
      add :user_id, references(:users, on_delete: :delete_all, type: :binary_id), null: false
      add :role, :string, null: false, default: "member"

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:circle_members, [:circle_id, :user_id])
    create index(:circle_members, [:user_id])

    create table(:circle_discussions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :circle_id, references(:circles, on_delete: :delete_all, type: :binary_id), null: false
      add :author_id, references(:users, on_delete: :nilify_all, type: :binary_id)
      add :title, :string, null: false
      add :body, :text, null: false
      add :is_prompt, :boolean, null: false, default: false
      add :is_pinned, :boolean, null: false, default: false
      add :is_locked, :boolean, null: false, default: false
      add :response_count, :integer, null: false, default: 0
      add :last_response_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:circle_discussions, [:circle_id, :inserted_at])
    create index(:circle_discussions, [:author_id])
    create index(:circle_discussions, [:circle_id, :is_pinned])

    create table(:circle_responses, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :discussion_id, references(:circle_discussions, on_delete: :delete_all, type: :binary_id), null: false
      add :author_id, references(:users, on_delete: :nilify_all, type: :binary_id)
      add :body, :text, null: false
      add :edited_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:circle_responses, [:discussion_id, :inserted_at])
    create index(:circle_responses, [:author_id])
  end
end
