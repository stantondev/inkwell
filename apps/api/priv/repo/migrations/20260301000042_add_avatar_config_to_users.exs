defmodule Inkwell.Repo.Migrations.AddAvatarConfigToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :avatar_config, :map
    end
  end
end
