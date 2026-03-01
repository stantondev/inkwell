defmodule Inkwell.Repo.Migrations.AddBioHtmlToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :bio_html, :text
    end
  end
end
