defmodule Inkwell.Repo.Migrations.CreatePenPalExchange do
  use Ecto.Migration

  def change do
    alter table(:conversations) do
      # Set when Inkwell introduced the two people (the pen pal exchange).
      # Both may write without following each other.
      add :introduced_at, :utc_datetime_usec
    end

    create table(:pen_pal_exchange_requests, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      # One line about themselves, shown to whoever they're introduced to.
      add :note, :string, size: 200
      # "waiting" | "matched" | "withdrawn"
      add :status, :string, size: 20, null: false, default: "waiting"
      add :partner_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :conversation_id, references(:conversations, type: :binary_id, on_delete: :nilify_all)
      add :matched_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:pen_pal_exchange_requests, [:user_id],
             where: "status = 'waiting'",
             name: :pen_pal_exchange_one_waiting
           )

    create index(:pen_pal_exchange_requests, [:status, :inserted_at])
    create index(:pen_pal_exchange_requests, [:user_id, :matched_at])
    create index(:pen_pal_exchange_requests, [:conversation_id])
  end
end
