defmodule Inkwell.Repo.Migrations.AddOptionsToDataImports do
  use Ecto.Migration

  # Per-import settings that aren't the file itself, e.g. the writer's
  # LiveJournal username so their own replies in imported comments show as them.
  def change do
    alter table(:data_imports) do
      add :options, :map, default: %{}
    end
  end
end
