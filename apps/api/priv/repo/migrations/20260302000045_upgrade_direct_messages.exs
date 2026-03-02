defmodule Inkwell.Repo.Migrations.UpgradeDirectMessages do
  use Ecto.Migration

  def change do
    alter table(:direct_messages) do
      add :body_html, :text
      add :edited_at, :utc_datetime_usec
    end
  end
end
