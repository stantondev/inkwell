defmodule Inkwell.Repo.Migrations.AddStampAlbumToUsers do
  use Ecto.Migration

  # How a writer has arranged the stamps they've received (Inkwell.Stamps.Album).
  def change do
    alter table(:users) do
      add :stamp_album, :map
    end
  end
end
