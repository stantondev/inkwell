defmodule Inkwell.Repo.Migrations.CreateUserStickers do
  use Ecto.Migration

  # A writer's own stickers (Arrange my page): pictures they uploaded,
  # kept in a library to place on their page. The picture itself is an
  # entry image, so it counts toward their image storage.
  def change do
    create table(:user_stickers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :image_id, references(:entry_images, type: :binary_id, on_delete: :delete_all), null: false
      add :name, :string, size: 60
      add :outline, :boolean, default: true, null: false
      add :ratio, :float, default: 1.0, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:user_stickers, [:user_id])
    create unique_index(:user_stickers, [:image_id])
  end
end
