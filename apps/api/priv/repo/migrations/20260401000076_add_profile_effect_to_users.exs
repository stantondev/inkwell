defmodule Inkwell.Repo.Migrations.AddProfileEffectToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_effect, :string
      add :profile_effect_intensity, :string, default: "subtle"
    end
  end
end
