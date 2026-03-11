defmodule Inkwell.Repo.Migrations.AddBodyHtmlToCircles do
  use Ecto.Migration

  def change do
    alter table(:circle_discussions) do
      add :body_html, :text
      add :edited_at, :utc_datetime_usec
    end

    alter table(:circle_responses) do
      add :body_html, :text
    end
  end
end
