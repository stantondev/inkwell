defmodule Inkwell.Repo.Migrations.CreateUserWarnings do
  use Ecto.Migration

  def change do
    create table(:user_warnings, primary_key: false) do
      add :id, :binary_id, primary_key: true

      # The user being warned
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      # The admin who issued the warning
      add :issued_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      # Policy reason category — mirrors report reasons so a report → warning carries its context
      add :reason, :string, null: false

      # Optional admin-written note shown in the warning letter
      add :details, :text

      # Optional links to the triggering content
      add :report_id, references(:reports, type: :binary_id, on_delete: :nilify_all)
      add :entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)

      # The strike number this warning produced (1, 2, 3, …) — denormalized for display
      add :strike_number, :integer, null: false

      # Whether this warning auto-escalated to an account block (i.e. last straw)
      add :escalated_to_block, :boolean, default: false, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:user_warnings, [:user_id])
    create index(:user_warnings, [:issued_by_id])
    create index(:user_warnings, [:inserted_at])

    alter table(:users) do
      add :strike_count, :integer, default: 0, null: false
    end

    create index(:users, [:strike_count])
  end
end
