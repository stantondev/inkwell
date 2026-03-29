defmodule Inkwell.Repo.Migrations.AddAvatarAnimationToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :avatar_animation, :string
    end
  end
end
