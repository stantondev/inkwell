defmodule Inkwell.Repo.Migrations.AddStationeryToGuestbookEntries do
  use Ecto.Migration

  # The paper a signer chose (cream, sky, rose, sage, lilac, kraft); nil = cream.
  def change do
    alter table(:guestbook_entries) do
      add :stationery, :string, size: 20
    end
  end
end
