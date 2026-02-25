defmodule Inkwell.Repo.Migrations.AddCategoryToEntries do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      add :category, :string
    end

    create index(:entries, [:category])
  end
end
