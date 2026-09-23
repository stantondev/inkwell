defmodule Inkwell.Repo.Migrations.AddLetterControlsAndRequests do
  use Ecto.Migration

  # Letters phase 3.
  #
  # conversation_reads becomes each person's own view of a conversation:
  # archived_at (hidden until a newer letter), muted_at (no push, email or
  # badge), cleared_at ("delete for me": letters up to then are hidden for
  # this person only).
  #
  # conversations.request_status: nil for an ordinary conversation between
  # pen pals; "pending" / "accepted" / "declined" for one started as a letter
  # request by someone who isn't a pen pal (requested_by_id, requested_at).
  def change do
    alter table(:conversation_reads) do
      add :archived_at, :utc_datetime_usec
      add :muted_at, :utc_datetime_usec
      add :cleared_at, :utc_datetime_usec
    end

    alter table(:conversations) do
      add :request_status, :string
      add :requested_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :requested_at, :utc_datetime_usec
    end

    create index(:conversations, [:requested_by_id, :inserted_at])
  end
end
