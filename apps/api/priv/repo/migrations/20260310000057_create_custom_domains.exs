defmodule Inkwell.Repo.Migrations.CreateCustomDomains do
  use Ecto.Migration

  def change do
    create table(:custom_domains, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :domain, :string, null: false
      add :status, :string, null: false, default: "pending_dns"
      add :dns_verified_at, :utc_datetime_usec
      add :cert_issued_at, :utc_datetime_usec
      add :last_check_at, :utc_datetime_usec
      add :error_message, :string
      add :fly_cert_id, :string

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:custom_domains, [:domain])
    create unique_index(:custom_domains, [:user_id])
    create index(:custom_domains, [:status])
  end
end
