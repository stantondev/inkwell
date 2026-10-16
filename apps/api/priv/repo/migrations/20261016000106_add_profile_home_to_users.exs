defmodule Inkwell.Repo.Migrations.AddProfileHomeToUsers do
  use Ecto.Migration

  # The arrangement of the profile page (Inkwell.ProfileHome). Filled for
  # existing accounts by Inkwell.ProfileHome.backfill/0 after deploy; until
  # then (and for anyone missed) it is worked out from the old layout fields.
  def change do
    alter table(:users) do
      add :profile_home, :map
    end
  end
end
