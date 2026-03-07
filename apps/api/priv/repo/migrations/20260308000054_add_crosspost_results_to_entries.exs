defmodule Inkwell.Repo.Migrations.AddCrosspostResultsToEntries do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      add :crosspost_results, :map, default: %{}
    end
  end
end
