defmodule Inkwell.Repo.Migrations.CreateRemoteEntries do
  use Ecto.Migration

  def change do
    create table(:remote_entries, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :ap_id, :text, null: false
      add :url, :text
      add :title, :string
      add :body_html, :text, null: false
      add :tags, {:array, :string}, default: []
      add :published_at, :utc_datetime_usec
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:remote_entries, [:ap_id])
    create index(:remote_entries, [:remote_actor_id])
    create index(:remote_entries, [:published_at])
  end
end
