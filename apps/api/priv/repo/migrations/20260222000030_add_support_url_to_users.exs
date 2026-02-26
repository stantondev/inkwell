defmodule Inkwell.Repo.Migrations.AddSupportUrlToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :support_url, :string
      add :support_label, :string
    end
  end
end
