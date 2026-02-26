defmodule Inkwell.Repo.Migrations.AddBannerAndAvatarFrame do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_banner_url, :text
      add :avatar_frame, :string
    end

    alter table(:remote_actors) do
      add :banner_url, :text
    end
  end
end
