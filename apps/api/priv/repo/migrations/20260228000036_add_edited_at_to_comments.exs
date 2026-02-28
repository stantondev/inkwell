defmodule Inkwell.Repo.Migrations.AddEditedAtToComments do
  use Ecto.Migration

  def change do
    alter table(:comments) do
      add :edited_at, :utc_datetime_usec
    end
  end
end
