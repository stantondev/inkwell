defmodule Inkwell.Repo.Migrations.CreateTopFriends do
  use Ecto.Migration

  def change do
    create table(:top_friends, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :position, :integer, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :friend_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:top_friends, [:user_id, :position])
    create index(:top_friends, [:user_id])
  end
end
