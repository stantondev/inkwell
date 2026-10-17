defmodule Inkwell.Repo.Migrations.AddStampTypeToDirectMessages do
  use Ecto.Migration

  # The stamp a member puts on a letter's envelope (Inkwell.Stamps.Stamp
  # designs). Optional; letters from the fediverse never have one stored.
  def change do
    alter table(:direct_messages) do
      add :stamp_type, :string
    end
  end
end
