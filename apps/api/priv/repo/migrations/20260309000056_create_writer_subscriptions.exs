defmodule Inkwell.Repo.Migrations.CreateWriterSubscriptions do
  use Ecto.Migration

  def change do
    create table(:writer_plans, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :writer_id, references(:users, on_delete: :delete_all, type: :binary_id), null: false
      add :name, :string, null: false
      add :description, :text
      add :price_cents, :integer, null: false
      add :currency, :string, null: false, default: "usd"
      add :stripe_product_id, :string
      add :stripe_price_id, :string
      add :status, :string, null: false, default: "active"
      add :subscriber_count, :integer, null: false, default: 0
      add :total_earned_cents, :integer, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create index(:writer_plans, [:writer_id])
    create index(:writer_plans, [:status])

    create table(:writer_plan_subscriptions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :plan_id, references(:writer_plans, on_delete: :delete_all, type: :binary_id), null: false
      add :subscriber_id, references(:users, on_delete: :delete_all, type: :binary_id), null: false
      add :writer_id, references(:users, on_delete: :delete_all, type: :binary_id), null: false
      add :stripe_subscription_id, :string
      add :status, :string, null: false, default: "active"
      add :current_period_end, :utc_datetime_usec
      add :canceled_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:writer_plan_subscriptions, [:subscriber_id, :writer_id])
    create index(:writer_plan_subscriptions, [:plan_id])
    create index(:writer_plan_subscriptions, [:writer_id, :status])
    create index(:writer_plan_subscriptions, [:stripe_subscription_id])
  end
end
