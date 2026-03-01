defmodule Inkwell.Repo.Migrations.CreateInvitations do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :invite_code, :string, size: 12
      add :invited_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
    end

    create unique_index(:users, [:invite_code])

    create table(:invitations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :inviter_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :email, :string, null: false
      add :token, :string, null: false
      add :status, :string, default: "pending", null: false
      add :accepted_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :accepted_at, :utc_datetime_usec
      add :message, :string, size: 500
      add :expires_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:invitations, [:token])
    create index(:invitations, [:inviter_id])
    create index(:invitations, [:email])
  end
end
