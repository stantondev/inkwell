defmodule Inkwell.Repo.Migrations.AddEngagementRefreshedAtToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :engagement_refreshed_at, :utc_datetime_usec
    end
  end
end
