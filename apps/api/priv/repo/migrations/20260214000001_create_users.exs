defmodule Inkwell.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    execute "CREATE EXTENSION IF NOT EXISTS citext", ""

    create table(:users, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :username, :citext, null: false
      add :email, :citext, null: false
      add :display_name, :string
      add :bio, :text
      add :pronouns, :string
      add :avatar_url, :string
      add :profile_html, :text
      add :profile_css, :text
      add :ap_id, :string, null: false
      add :public_key, :text, null: false
      add :private_key, :text, null: false
      add :settings, :map, default: %{}

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:users, [:username])
    create unique_index(:users, [:email])
    create unique_index(:users, [:ap_id])
  end
end
