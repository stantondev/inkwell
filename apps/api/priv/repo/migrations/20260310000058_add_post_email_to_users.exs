defmodule Inkwell.Repo.Migrations.AddPostEmailToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :post_email_token, :string
    end

    create unique_index(:users, [:post_email_token])

    alter table(:entries) do
      add :source, :string
    end
  end
end
