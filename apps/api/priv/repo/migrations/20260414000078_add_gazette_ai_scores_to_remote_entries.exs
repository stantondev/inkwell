defmodule Inkwell.Repo.Migrations.AddGazetteAiScoresToRemoteEntries do
  use Ecto.Migration

  def change do
    alter table(:remote_entries) do
      add :gazette_is_news, :boolean, default: nil
      add :gazette_relevance, :float, default: nil
      add :gazette_topic, :string, default: nil
      add :gazette_summary, :string, default: nil
      add :gazette_cluster_id, :string, default: nil
      add :gazette_scored_at, :utc_datetime_usec, default: nil
    end

    create index(:remote_entries, [:gazette_scored_at])
  end
end
