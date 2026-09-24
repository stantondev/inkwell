defmodule Inkwell.Repo.Migrations.AddMoodKeyAndLocationToEntries do
  use Ecto.Migration

  # mood_key: which face the mood wears (a key from apps/web/src/lib/moods.ts);
  # `mood` stays the words the writer shows. location: "Current location".
  def change do
    alter table(:entries) do
      add :mood_key, :string, size: 40
      add :location, :string, size: 100
    end
  end
end
