defmodule Inkwell.Repo.Migrations.AddFoundingMembersAndPlusTrials do
  use Ecto.Migration

  def change do
    alter table(:users) do
      # Founding Members: one-time purchase of Plus for as long as Inkwell runs.
      # Numbered in purchase order; the unique index keeps numbers from colliding.
      add :founding_member_number, :integer
      add :founding_member_at, :utc_datetime_usec
      add :founding_member_payment_id, :string

      # Free Plus trial (one per account, no card).
      add :plus_trial_started_at, :utc_datetime_usec
    end

    create unique_index(:users, [:founding_member_number])
    create unique_index(:users, [:founding_member_payment_id])
  end
end
