defmodule Inkwell.Repo.Migrations.AddArchiveOriginToEntries do
  use Ecto.Migration

  # Where an imported post first lived ("livejournal", "dreamwidth",
  # "wordpress", …), its address there when we know it, and whether the
  # writer wants it shown with the archive postmark and cover letter.
  def change do
    alter table(:entries) do
      add :imported_from, :string
      add :imported_url, :string, size: 500
      add :archive_mark, :boolean, default: false, null: false
    end

    create index(:entries, [:user_id, :imported_from], where: "imported_from IS NOT NULL")
  end
end
