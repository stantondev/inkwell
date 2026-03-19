defmodule Inkwell.Repo.Migrations.CreateFediverseBlocks do
  use Ecto.Migration

  def change do
    # Individual remote actor blocks (per-user)
    create table(:blocked_remote_actors, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:blocked_remote_actors, [:user_id, :remote_actor_id])
    create index(:blocked_remote_actors, [:user_id])

    # Domain blocks (per-user + admin instance-level)
    # user_id = nil + blocked_by_admin = true → instance-level defederation
    # user_id = set + blocked_by_admin = false → user-level domain block
    create table(:blocked_domains, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: true
      add :domain, :string, null: false
      add :reason, :string
      add :blocked_by_admin, :boolean, default: false, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:blocked_domains, [:user_id])
    create index(:blocked_domains, [:domain])
    # User can only block a domain once
    create unique_index(:blocked_domains, [:user_id, :domain], where: "user_id IS NOT NULL", name: :blocked_domains_user_domain_index)
    # Only one admin block per domain
    create unique_index(:blocked_domains, [:domain], where: "blocked_by_admin = true", name: :blocked_domains_admin_domain_index)
  end
end
