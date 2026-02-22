defmodule Inkwell.Repo.Migrations.AddProfileForegroundColor do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_foreground_color, :string
    end
  end
end
