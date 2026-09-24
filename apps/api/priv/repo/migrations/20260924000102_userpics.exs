defmodule Inkwell.Repo.Migrations.Userpics do
  use Ecto.Migration

  # LiveJournal-style userpics: the picture itself is stored with the row
  # (served at /api/userpics/:id), so image_url is no longer required. Keywords
  # are unique per writer, as on LJ.
  def change do
    alter table(:user_icons) do
      add :data, :text
      add :content_type, :string, size: 20
      modify :image_url, :string, null: true, from: {:string, null: false}
    end

    create unique_index(:user_icons, ["user_id", "lower(keyword)"], name: :user_icons_user_keyword_index)
  end
end
