defmodule Inkwell.Repo.Migrations.AddEmailedAtToConversationReads do
  use Ecto.Migration

  # When we last emailed this person about unread letters in this
  # conversation, so a run of letters sends one email, not one each.
  def change do
    alter table(:conversation_reads) do
      add :emailed_at, :utc_datetime_usec
    end
  end
end
