defmodule Inkwell.Repo.Migrations.CreateOauthAppRegistrations do
  use Ecto.Migration

  def change do
    create table(:oauth_app_registrations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :domain, :string, null: false
      add :client_id, :text, null: false
      add :client_secret, :text, null: false
      add :redirect_uri, :string, null: false
      add :scopes, :string, default: "read"

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:oauth_app_registrations, [:domain])
  end
end
