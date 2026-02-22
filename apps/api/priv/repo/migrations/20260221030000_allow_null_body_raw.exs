defmodule Inkwell.Repo.Migrations.AllowNullBodyRaw do
  use Ecto.Migration

  def change do
    alter table(:entries) do
      modify :body_raw, :map, null: true
    end
  end
end
