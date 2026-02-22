defmodule Inkwell.Repo.Migrations.CreateGuestbookEntries do
  use Ecto.Migration

  def change do
    create table(:guestbook_entries, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :body, :string, null: false
      add :profile_user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :author_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime_usec)
    end

    create index(:guestbook_entries, [:profile_user_id])
    create index(:guestbook_entries, [:author_id])
  end
end
