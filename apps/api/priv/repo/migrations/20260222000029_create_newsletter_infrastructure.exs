defmodule Inkwell.Repo.Migrations.CreateNewsletterInfrastructure do
  use Ecto.Migration

  def change do
    # Newsletter subscribers — tracks who subscribes to each writer's newsletter
    create table(:newsletter_subscribers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :writer_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :email, :citext, null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all)
      add :status, :string, null: false, default: "pending"
      add :confirm_token, :string
      add :unsubscribe_token, :string, null: false
      add :source, :string, default: "subscribe_page"
      add :confirmed_at, :utc_datetime_usec
      add :unsubscribed_at, :utc_datetime_usec
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:newsletter_subscribers, [:writer_id, :email])
    create index(:newsletter_subscribers, [:writer_id, :status])
    create index(:newsletter_subscribers, [:confirm_token])
    create index(:newsletter_subscribers, [:unsubscribe_token])
    create index(:newsletter_subscribers, [:user_id])

    # Newsletter sends — tracks each newsletter delivery job
    create table(:newsletter_sends, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :entry_id, references(:entries, type: :binary_id, on_delete: :nilify_all)
      add :writer_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :subject, :string
      add :status, :string, null: false, default: "queued"
      add :recipient_count, :integer, default: 0
      add :sent_count, :integer, default: 0
      add :failed_count, :integer, default: 0
      add :scheduled_at, :utc_datetime_usec
      add :started_at, :utc_datetime_usec
      add :completed_at, :utc_datetime_usec
      add :error_message, :text
      timestamps(type: :utc_datetime_usec)
    end

    create index(:newsletter_sends, [:writer_id])
    create index(:newsletter_sends, [:entry_id])
    create index(:newsletter_sends, [:status])

    # Add newsletter fields to users
    alter table(:users) do
      add :newsletter_enabled, :boolean, default: false
      add :newsletter_name, :string
      add :newsletter_description, :string
      add :newsletter_reply_to, :string
    end

    # Add newsletter tracking to entries
    alter table(:entries) do
      add :newsletter_sent_at, :utc_datetime_usec
      add :newsletter_send_id, references(:newsletter_sends, type: :binary_id, on_delete: :nilify_all)
    end
  end
end
