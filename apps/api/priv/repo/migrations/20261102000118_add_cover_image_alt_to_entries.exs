defmodule Inkwell.Repo.Migrations.AddCoverImageAltToEntries do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      add :cover_image_alt, :text
    end
  end
end
