defmodule Inkwell.Repo.Migrations.CreateComments do
  use Ecto.Migration

  def change do
    create table(:comments, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :body_html, :text, null: false
      add :ap_id, :string
      add :remote_author, :map
      add :depth, :integer, default: 0
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :parent_comment_id, references(:comments, type: :binary_id, on_delete: :nilify_all)
      add :user_icon_id, references(:user_icons, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime_usec)
    end

    create index(:comments, [:entry_id, :inserted_at])
    create index(:comments, [:user_id])
    create index(:comments, [:parent_comment_id])
  end
end
