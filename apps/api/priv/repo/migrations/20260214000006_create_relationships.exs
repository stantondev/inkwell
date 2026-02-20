defmodule Inkwell.Repo.Migrations.CreateRelationships do
  use Ecto.Migration

  def change do
    create table(:relationships, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :status, :string, null: false, default: "pending"
      add :is_mutual, :boolean, default: false
      add :follower_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :following_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:relationships, [:follower_id, :following_id])
    create index(:relationships, [:following_id])
    create index(:relationships, [:status])
  end
end
