defmodule Inkwell.Repo.Migrations.CreateEntries do
  use Ecto.Migration

  def change do
    create table(:entries, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :title, :string
      add :body_html, :text, null: false
      add :body_raw, :map, null: false
      add :mood, :string
      add :music, :string
      add :music_metadata, :map
      add :privacy, :string, null: false, default: "public"
      add :slug, :string, null: false
      add :tags, {:array, :string}, default: []
      add :published_at, :utc_datetime_usec
      add :ap_id, :string, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :custom_filter_id, references(:friend_filters, type: :binary_id, on_delete: :nilify_all)
      add :user_icon_id, references(:user_icons, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime_usec)
    end

    create index(:entries, [:user_id, :published_at])
    create index(:entries, [:privacy, :published_at])
    create unique_index(:entries, [:user_id, :slug])
    create unique_index(:entries, [:ap_id])
    execute "CREATE INDEX entries_tags_idx ON entries USING GIN (tags)", "DROP INDEX entries_tags_idx"
  end
end
