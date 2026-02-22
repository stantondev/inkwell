defmodule Inkwell.Repo.Migrations.AddFederationNotificationFields do
  use Ecto.Migration

  def change do
    # Note: notification type is a string column (Ecto.Enum validates at app level)
    # so no ALTER TYPE needed — just add the new 'data' column and relax constraints

    alter table(:notifications) do
      add :data, :map, default: %{}
    end

    # Make target_type and target_id nullable for federated notifications
    # (federated likes/comments may not have a standard target_type/target_id)
    alter table(:notifications) do
      modify :target_type, :string, null: true, from: {:string, null: false}
      modify :target_id, :binary_id, null: true, from: {:binary_id, null: false}
    end
  end
end
