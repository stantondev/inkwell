defmodule Inkwell.Repo.Migrations.AddInkDonorFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :ink_donor_stripe_subscription_id, :string
      add :ink_donor_status, :string
      add :ink_donor_amount_cents, :integer
    end
  end
end
