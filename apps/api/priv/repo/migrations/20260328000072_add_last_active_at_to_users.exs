defmodule Inkwell.Repo.Migrations.AddLastActiveAtToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :last_active_at, :utc_datetime_usec
    end

    create index(:users, [:last_active_at])

    # Backfill: use updated_at as a reasonable proxy for last activity
    execute "UPDATE users SET last_active_at = updated_at", ""
  end
end
