defmodule Inkwell.Repo.Migrations.AddDataToAuthTokens do
  use Ecto.Migration

  def change do
    alter table(:auth_tokens) do
      add :data, :map
    end
  end
end
