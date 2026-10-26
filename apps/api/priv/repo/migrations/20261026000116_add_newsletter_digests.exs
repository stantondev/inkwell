defmodule Inkwell.Repo.Migrations.AddNewsletterDigests do
  use Ecto.Migration

  def change do
    alter table(:users) do
      # "each" (one email per post, as before), "weekly" or "count"
      add :newsletter_mode, :string, null: false, default: "each"
      # ISO weekday, 1 = Monday … 7 = Sunday
      add :newsletter_digest_day, :integer, null: false, default: 7
      add :newsletter_digest_hour, :integer, null: false, default: 9
      add :newsletter_digest_timezone, :string, null: false, default: "Etc/UTC"
      add :newsletter_digest_count, :integer, null: false, default: 3
    end

    alter table(:entries) do
      # Set when a post is held for the writer's next digest; cleared from the
      # queue once newsletter_send_id points at the digest that carried it.
      add :newsletter_queued_at, :utc_datetime_usec
    end

    alter table(:newsletter_sends) do
      add :kind, :string, null: false, default: "entry"
    end

    create index(:entries, [:user_id, :newsletter_queued_at],
             where: "newsletter_queued_at IS NOT NULL AND newsletter_send_id IS NULL",
             name: :entries_newsletter_digest_queue_index
           )
  end
end
