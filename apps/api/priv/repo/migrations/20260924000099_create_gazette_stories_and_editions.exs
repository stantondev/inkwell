defmodule Inkwell.Repo.Migrations.CreateGazetteStoriesAndEditions do
  use Ecto.Migration

  def change do
    # Links the fediverse is sharing, merged from several servers' public
    # trending-links lists. One row per article URL.
    create table(:gazette_stories, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :url, :text, null: false
      add :title, :text, null: false
      add :description, :text
      add :image_url, :text
      add :image_description, :text
      add :blurhash, :string
      add :provider_name, :string
      add :provider_url, :text
      add :author_name, :string
      add :language, :string, size: 16
      add :article_published_at, :utc_datetime_usec
      add :opinion, :boolean, null: false, default: false
      add :topics, {:array, :string}, null: false, default: []
      add :shares_today, :integer, null: false, default: 0
      add :shares_week, :integer, null: false, default: 0
      add :trending_on, {:array, :string}, null: false, default: []
      add :first_seen_at, :utc_datetime_usec, null: false
      add :last_seen_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:gazette_stories, [:url])
    create index(:gazette_stories, [:last_seen_at])

    # A fixed, numbered issue of the paper. Stories are snapshotted so an old
    # edition still reads the same after its stories are cleaned up.
    create table(:gazette_editions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :number, :integer, null: false
      add :slot, :string, null: false
      add :published_at, :utc_datetime_usec, null: false
      add :stories, :map, null: false, default: %{}
      add :story_count, :integer, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:gazette_editions, [:number])
    create index(:gazette_editions, [:published_at])

    # "Write about this": the story an entry responds to.
    alter table(:entries) do
      add :gazette_story_id, references(:gazette_stories, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:entries, [:gazette_story_id])
  end
end
