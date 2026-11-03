defmodule Inkwell.Repo.Migrations.AddBlueskyAccounts do
  use Ecto.Migration

  def change do
    # A member's Bluesky account, for "Sign in with Bluesky" and for sharing
    # entries there. Keyed by the account's DID, which never changes; the
    # handle can. Tokens and the DPoP key are stored encrypted.
    create table(:bluesky_accounts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :did, :string, null: false
      add :handle, :string
      add :display_name, :string
      add :avatar_url, :text
      add :pds_url, :string
      add :auth_server, :string
      add :scope, :string
      add :session, :text
      add :access_expires_at, :utc_datetime_usec
      add :remote_created_at, :utc_datetime_usec
      add :posts_count, :integer
      add :followers_count, :integer
      add :last_verified_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:bluesky_accounts, [:did])
    create unique_index(:bluesky_accounts, [:user_id])

    # A Bluesky sign-in in progress carries its PKCE verifier and DPoP key
    # (encrypted) until the member comes back.
    alter table(:oauth_states) do
      add :data, :text
    end

    # Set when a member signs in with or links an older Bluesky or Mastodon
    # account that has real history; such members skip the new-account holds.
    alter table(:users) do
      add :vouched_at, :utc_datetime_usec
      add :vouched_via, :string
    end
  end
end
