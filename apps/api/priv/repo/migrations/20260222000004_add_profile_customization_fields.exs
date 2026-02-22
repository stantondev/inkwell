defmodule Inkwell.Repo.Migrations.AddProfileCustomizationFields do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_music, :string
      add :profile_background_url, :text
      add :profile_background_color, :string
      add :profile_accent_color, :string
      add :profile_font, :string
      add :profile_layout, :string
      add :profile_widgets, :map, default: %{}
      add :profile_status, :string
      add :profile_theme, :string
    end
  end
end
