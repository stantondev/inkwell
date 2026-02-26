defmodule Inkwell.Repo.Migrations.CreateTips do
  use Ecto.Migration

  def change do
    create table(:tips, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sender_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :recipient_id, references(:users, type: :binary_id, on_delete: :nilify_all), null: false
      add :amount_cents, :integer, null: false
      add :total_cents, :integer, null: false
      add :currency, :string, default: "usd", null: false
      add :stripe_payment_intent_id, :string
      add :anonymous, :boolean, default: false, null: false
      add :message, :string
      add :status, :string, default: "pending", null: false

      timestamps()
    end

    create index(:tips, [:sender_id])
    create index(:tips, [:recipient_id])
    create index(:tips, [:stripe_payment_intent_id], unique: true)
    create index(:tips, [:status])
  end
end
