defmodule Inkwell.Repo.Migrations.AddSubscriptionFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :stripe_customer_id, :string
      add :stripe_subscription_id, :string
      add :subscription_tier, :string, default: "free"
      add :subscription_status, :string, default: "none"
      add :subscription_expires_at, :utc_datetime_usec
    end

    create index(:users, [:stripe_customer_id])
  end
end
