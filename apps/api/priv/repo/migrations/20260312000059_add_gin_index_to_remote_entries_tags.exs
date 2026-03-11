defmodule Inkwell.Repo.Migrations.AddGinIndexToRemoteEntriesTags do
  use Ecto.Migration

  def change do
    create index(:remote_entries, [:tags], using: :gin)
  end
end
