defmodule Inkwell.Repo.Migrations.CreatePolls do
  use Ecto.Migration

  def change do
    create table(:polls, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :question, :string, null: false
      add :type, :string, null: false, default: "platform"
      add :status, :string, null: false, default: "open"
      add :max_choices, :integer, null: false, default: 1
      add :closes_at, :utc_datetime_usec
      add :closed_at, :utc_datetime_usec
      add :total_votes, :integer, null: false, default: 0
      add :creator_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all)

      timestamps(type: :utc_datetime_usec)
    end

    create index(:polls, [:type, :status])
    create index(:polls, [:entry_id])
    create index(:polls, [:creator_id])

    create table(:poll_options, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :label, :string, null: false
      add :position, :integer, null: false, default: 0
      add :vote_count, :integer, null: false, default: 0
      add :poll_id, references(:polls, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:poll_options, [:poll_id, :position])

    create table(:poll_votes, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :poll_id, references(:polls, type: :binary_id, on_delete: :delete_all), null: false
      add :poll_option_id, references(:poll_options, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:poll_votes, [:user_id, :poll_id])
    create index(:poll_votes, [:poll_id])
    create index(:poll_votes, [:poll_option_id])
  end
end
