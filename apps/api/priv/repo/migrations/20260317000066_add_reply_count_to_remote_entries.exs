defmodule Inkwell.Repo.Migrations.AddReplyCountToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :reply_count, :integer, default: 0
    end
  end
end
