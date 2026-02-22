defmodule Inkwell.Repo.Migrations.AddStatusToEntries do
  use Ecto.Migration

  def change do
    # Add status column — all existing entries get "published" by default
    alter table(:entries) do
      add :status, :string, null: false, default: "published"
    end

    # Allow NULL slug, ap_id, and body_html for drafts
    alter table(:entries) do
      modify :slug, :string, null: true, from: {:string, null: false}
      modify :ap_id, :string, null: true, from: {:string, null: false}
      modify :body_html, :text, null: true, from: {:text, null: false}
    end

    # Drop old unique indexes that don't allow NULLs
    drop unique_index(:entries, [:user_id, :slug])
    drop unique_index(:entries, [:ap_id])

    # Recreate as partial indexes (only enforce uniqueness for non-null values)
    create unique_index(:entries, [:user_id, :slug],
      where: "slug IS NOT NULL",
      name: :entries_user_id_slug_index
    )

    create unique_index(:entries, [:ap_id],
      where: "ap_id IS NOT NULL",
      name: :entries_ap_id_index
    )

    # Index for efficient draft listing
    create index(:entries, [:user_id, :status])
  end
end
