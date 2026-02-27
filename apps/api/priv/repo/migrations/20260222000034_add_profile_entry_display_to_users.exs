defmodule Inkwell.Repo.Migrations.AddProfileEntryDisplayToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_entry_display, :string, default: "cards"
    end
  end
end
