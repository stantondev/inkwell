defmodule Inkwell.Repo.Migrations.CreateConversationReads do
  use Ecto.Migration

  def change do
    create table(:conversation_reads, primary_key: false) do
      add :conversation_id, references(:conversations, type: :binary_id, on_delete: :delete_all), null: false, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false, primary_key: true
      add :last_read_at, :utc_datetime_usec, null: false
    end
  end
end
