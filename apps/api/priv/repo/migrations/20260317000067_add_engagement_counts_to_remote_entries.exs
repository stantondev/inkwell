defmodule Inkwell.Repo.Migrations.AddEngagementCountsToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :likes_count, :integer, default: 0, null: false
      add :boosts_count, :integer, default: 0, null: false
    end
  end
end
