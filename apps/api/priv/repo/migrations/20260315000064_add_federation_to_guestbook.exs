defmodule Inkwell.Repo.Migrations.AddFederationToGuestbook do
  use Ecto.Migration

  def change do
    alter table(:guestbook_entries) do
      add :remote_author, :map
      add :ap_id, :string
      modify :author_id, references(:users, type: :binary_id, on_delete: :nilify_all),
        null: true, from: references(:users, type: :binary_id, on_delete: :nilify_all)
    end

    create unique_index(:guestbook_entries, [:ap_id], where: "ap_id IS NOT NULL")
  end
end
