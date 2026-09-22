defmodule Inkwell.Repo.Migrations.CreateBillingCheckoutAttempts do
  use Ecto.Migration

  def change do
    create table(:billing_checkout_attempts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :kind, :string, null: false
      add :plan_variation_id, :string

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:billing_checkout_attempts, [:inserted_at])
    create index(:billing_checkout_attempts, [:user_id])
  end
end
