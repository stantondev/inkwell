defmodule Inkwell.Repo.Migrations.AddProfileImprovements do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :pinned_entry_ids, {:array, :string}, default: []
      add :social_links, :map, default: %{}
    end
  end
end
