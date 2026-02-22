defmodule Inkwell.Repo.Migrations.CreateRemoteActors do
  use Ecto.Migration

  def change do
    create table(:remote_actors, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :ap_id, :text, null: false
      add :username, :string
      add :domain, :string
      add :display_name, :string
      add :avatar_url, :text
      add :inbox, :text, null: false
      add :shared_inbox, :text
      add :public_key_pem, :text, null: false
      add :raw_data, :map

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:remote_actors, [:ap_id])
    create index(:remote_actors, [:domain])
  end
end
