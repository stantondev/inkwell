defmodule Inkwell.Repo.Migrations.AddAdminFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :role, :string, default: "user", null: false
      add :blocked_at, :utc_datetime_usec
    end

    create index(:users, [:role])
    create index(:users, [:subscription_tier])
    create index(:users, [:blocked_at])
  end
end
