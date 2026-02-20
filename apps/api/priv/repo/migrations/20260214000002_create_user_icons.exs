defmodule Inkwell.Repo.Migrations.CreateUserIcons do
  use Ecto.Migration

  def change do
    create table(:user_icons, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :image_url, :string, null: false
      add :keyword, :string, null: false
      add :is_default, :boolean, default: false
      add :sort_order, :integer, default: 0
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:user_icons, [:user_id])
  end
end
