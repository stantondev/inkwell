defmodule Inkwell.Repo.Migrations.AddRepliesFetchedAtToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :replies_fetched_at, :utc_datetime_usec
    end
  end
end
