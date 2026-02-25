defmodule Inkwell.Repo.Migrations.CreateFediverseAccounts do
  use Ecto.Migration

  def change do
    create table(:fediverse_accounts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :domain, :string, null: false
      add :remote_username, :string, null: false
      add :remote_acct, :string, null: false
      add :remote_actor_uri, :string
      add :remote_display_name, :string
      add :remote_avatar_url, :text
      add :access_token, :text
      add :token_scope, :string, default: "read"
      add :last_verified_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:fediverse_accounts, [:domain, :remote_username])
    create index(:fediverse_accounts, [:user_id])
  end
end
