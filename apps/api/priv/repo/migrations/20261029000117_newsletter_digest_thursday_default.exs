defmodule Inkwell.Repo.Migrations.NewsletterDigestThursdayDefault do
  use Ecto.Migration

  # Weekly digests default to Thursday 2pm (@stoicalgeezer's research: after the
  # midweek hump, in the mid-afternoon slump). Writers already sending weekly
  # keep the day and hour they have; everyone else still has the old untouched
  # default (Sunday 9am) and gets the new one.
  def up do
    alter table(:users) do
      modify :newsletter_digest_day, :integer, null: false, default: 4
      modify :newsletter_digest_hour, :integer, null: false, default: 14
    end

    execute """
    UPDATE users SET newsletter_digest_day = 4, newsletter_digest_hour = 14
    WHERE newsletter_mode <> 'weekly' AND newsletter_digest_day = 7 AND newsletter_digest_hour = 9
    """
  end

  def down do
    alter table(:users) do
      modify :newsletter_digest_day, :integer, null: false, default: 7
      modify :newsletter_digest_hour, :integer, null: false, default: 9
    end
  end
end
