defmodule Inkwell.Repo.Migrations.AddVisitorCountToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :visitor_count, :integer, default: 0, null: false
    end
  end
end
