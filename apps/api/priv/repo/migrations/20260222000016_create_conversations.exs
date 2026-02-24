defmodule Inkwell.Repo.Migrations.CreateConversations do
  use Ecto.Migration

  def change do
    create table(:conversations, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :participant_a, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :participant_b, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :last_message_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:conversations, [:participant_a, :participant_b])
    create index(:conversations, [:last_message_at])

    # Enforce canonical ordering: participant_a UUID always < participant_b UUID
    # This ensures only one row per pair and simplifies all queries.
    create constraint(:conversations, :canonical_participant_ordering,
      check: "participant_a < participant_b"
    )
  end
end
