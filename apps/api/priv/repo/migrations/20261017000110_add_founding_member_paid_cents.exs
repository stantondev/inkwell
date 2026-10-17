defmodule Inkwell.Repo.Migrations.AddFoundingMemberPaidCents do
  use Ecto.Migration

  # What each Founding Member actually paid. The price rises over time, so the
  # amount raised can no longer be worked out as members × today's price.
  def up do
    alter table(:users) do
      add :founding_member_paid_cents, :integer
    end

    flush()

    # Everyone who bought before this column existed paid $99.
    execute "UPDATE users SET founding_member_paid_cents = 9900 WHERE founding_member_number IS NOT NULL"
  end

  def down do
    alter table(:users) do
      remove :founding_member_paid_cents
    end
  end
end
