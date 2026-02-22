defmodule Inkwell.Repo.Migrations.CreateEntryImages do
  use Ecto.Migration

  def change do
    create table(:entry_images, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :data, :text, null: false
      add :content_type, :string, null: false
      add :filename, :string
      add :byte_size, :integer

      timestamps(type: :utc_datetime_usec)
    end

    create index(:entry_images, [:user_id])
  end
end
