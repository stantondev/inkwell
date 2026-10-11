defmodule Inkwell.Repo.Migrations.UserReports do
  use Ecto.Migration

  # Reports about an account, not just an entry (Jon Henshaw's roadmap post,
  # 2026-10-11). Every report now names the account it's about: entry reports
  # carry the entry's author (backfilled below), account reports have no entry.
  def up do
    alter table(:reports) do
      add :reported_user_id, references(:users, type: :binary_id, on_delete: :delete_all)
    end

    execute """
    UPDATE reports r SET reported_user_id = e.user_id
    FROM entries e WHERE e.id = r.entry_id AND r.reported_user_id IS NULL
    """

    create index(:reports, [:reported_user_id])

    # One report per person per account (entry reports keep their own index).
    create unique_index(:reports, [:reporter_id, :reported_user_id],
             where: "entry_id IS NULL",
             name: :reports_reporter_account_index
           )

    create constraint(:reports, :report_has_subject,
             check: "entry_id IS NOT NULL OR reported_user_id IS NOT NULL"
           )
  end

  def down do
    drop constraint(:reports, :report_has_subject)
    drop index(:reports, [:reporter_id, :reported_user_id], name: :reports_reporter_account_index)
    execute "DELETE FROM reports WHERE entry_id IS NULL"

    alter table(:reports) do
      remove :reported_user_id
    end
  end
end
