defmodule Inkwell.Repo.Migrations.CreateSeries do
  use Ecto.Migration

  def change do
    create table(:series, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :description, :text
      add :slug, :string, null: false
      add :cover_image_id, references(:entry_images, type: :binary_id, on_delete: :nilify_all)
      add :status, :string, null: false, default: "ongoing"

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:series, [:user_id, :slug])
    create index(:series, [:user_id])

    alter table(:entries) do
      add :series_id, references(:series, type: :binary_id, on_delete: :nilify_all)
      add :series_order, :integer
    end

    create index(:entries, [:series_id, :series_order])
  end
end
