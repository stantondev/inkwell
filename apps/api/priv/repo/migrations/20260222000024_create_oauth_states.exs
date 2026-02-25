defmodule Inkwell.Repo.Migrations.CreateOauthStates do
  use Ecto.Migration

  def change do
    create table(:oauth_states, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :state, :string, null: false
      add :domain, :string, null: false
      add :redirect_after, :string
      add :linking_user_id, references(:users, type: :binary_id, on_delete: :delete_all)
      add :expires_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:oauth_states, [:state])
  end
end
