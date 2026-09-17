defmodule Inkwell.Repo.Migrations.CreateModerationActions do
  use Ecto.Migration

  def change do
    alter table(:users) do
      # nil = normal, "limited" = kept out of Explore/discovery pending review
      add :moderation_state, :string
      # Set when an admin undoes an automated action; the scanner leaves the
      # account alone afterwards unless new reports arrive.
      add :moderation_cleared_at, :utc_datetime_usec
    end

    create table(:moderation_actions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
      # block | limit | hide_entry | clear
      add :action, :string, null: false
      add :automated, :boolean, null: false, default: true
      add :score, :integer
      add :reasons, {:array, :string}, null: false, default: []
      # Entries this action hid, so an undo restores exactly those.
      add :hidden_entry_ids, {:array, :binary_id}, null: false, default: []
      add :reversed_at, :utc_datetime_usec
      add :reversed_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:moderation_actions, [:user_id])
    create index(:moderation_actions, [:inserted_at])
  end
end
