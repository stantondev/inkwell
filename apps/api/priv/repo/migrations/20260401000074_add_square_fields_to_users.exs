defmodule Inkwell.Repo.Migrations.AddSquareFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :square_customer_id, :string
      add :square_subscription_id, :string
      add :square_donor_subscription_id, :string
    end

    create index(:users, [:square_customer_id])
  end
end
