defmodule Inkwell.Repo.Migrations.AddStripeConnectToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :stripe_connect_account_id, :string
      add :stripe_connect_enabled, :boolean, default: false
      add :stripe_connect_onboarded, :boolean, default: false
    end
  end
end
