defmodule Inkwell.Repo.Migrations.CreateFeatureUsage do
  use Ecto.Migration

  # Which features get used (Inkwell.Usage). Daily totals per feature, plus
  # one row per member per feature saying when they first and last used it.
  def change do
    create table(:feature_use_days, primary_key: false) do
      add :feature, :string, null: false
      add :action, :string, null: false, default: ""
      add :detail, :string, null: false, default: ""
      add :day, :date, null: false
      # Members using it for the first time that day (each member once a day)
      add :members, :integer, null: false, default: 0
      # Signed-out visitors, deduped per day by a salted hash kept in memory
      add :visitors, :integer, null: false, default: 0
      add :uses, :integer, null: false, default: 0
    end

    create unique_index(:feature_use_days, [:feature, :action, :detail, :day])
    create index(:feature_use_days, [:day])

    create table(:feature_members, primary_key: false) do
      add :feature, :string, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :first_used_on, :date, null: false
      add :last_used_on, :date, null: false
      add :days_used, :integer, null: false, default: 1
      # For features that report steps (the game): how many times each step,
      # and the furthest level, e.g. %{"letter_delivered" => 4, "best_level" => 3}
      add :progress, :map, null: false, default: %{}
    end

    create unique_index(:feature_members, [:feature, :user_id])
    create index(:feature_members, [:user_id])
  end
end
