defmodule Inkwell.Repo.Migrations.CreateDirectMessages do
  use Ecto.Migration

  def change do
    create table(:direct_messages, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :conversation_id, references(:conversations, type: :binary_id, on_delete: :delete_all), null: false
      add :sender_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :body, :text, null: false
      add :deleted_by_a, :boolean, null: false, default: false
      add :deleted_by_b, :boolean, null: false, default: false

      timestamps(type: :utc_datetime_usec)
    end

    # Primary query pattern: messages in a conversation, newest first
    create index(:direct_messages, [:conversation_id, :inserted_at])
  end
end
