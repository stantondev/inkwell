defmodule Inkwell.Repo.Migrations.CreateFriendFilters do
  use Ecto.Migration

  def change do
    create table(:friend_filters, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :member_ids, {:array, :binary_id}, default: []
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:friend_filters, [:user_id])
  end
end
