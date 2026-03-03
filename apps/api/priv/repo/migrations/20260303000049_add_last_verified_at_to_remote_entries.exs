defmodule Inkwell.Repo.Migrations.AddLastVerifiedAtToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :last_verified_at, :utc_datetime_usec
    end
  end
end
