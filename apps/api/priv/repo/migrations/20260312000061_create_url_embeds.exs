defmodule Inkwell.Repo.Migrations.CreateUrlEmbeds do
  use Ecto.Migration

  def change do
    create table(:url_embeds, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :url_hash, :string, null: false
      add :url, :text, null: false
      add :title, :text
      add :description, :text
      add :thumbnail_url, :text
      add :author_name, :string
      add :author_url, :text
      add :provider_name, :string
      add :provider_url, :text
      add :site_name, :string
      add :embed_type, :string, default: "link"
      add :published_at, :string
      add :fetched_at, :utc_datetime_usec, null: false

      timestamps()
    end

    create unique_index(:url_embeds, [:url_hash])
  end
end
