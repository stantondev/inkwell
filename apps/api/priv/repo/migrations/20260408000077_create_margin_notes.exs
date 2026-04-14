defmodule Inkwell.Repo.Migrations.CreateMarginNotes do
  use Ecto.Migration

  def change do
    create table(:margin_notes, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      # Text anchor — W3C Web Annotation TextQuoteSelector
      add :quote_text, :text, null: false
      add :quote_prefix, :text, null: false, default: ""
      add :quote_suffix, :text, null: false, default: ""
      # sha256 of prefix <> "\x1f" <> quote <> "\x1f" <> suffix — used for dedupe
      add :quote_hash, :binary, null: false

      # Optional fast-path hint — TextPositionSelector (char offsets)
      add :text_position_start, :integer
      add :text_position_end, :integer

      # The margin note body — sanitized HTML, capped at ~500 plain chars
      add :note_html, :text, null: false

      add :edited_at, :utc_datetime_usec
      # When the server diff detects the anchor no longer resolves
      add :orphaned_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    # One note per user per passage per entry
    create unique_index(:margin_notes, [:entry_id, :user_id, :quote_hash])
    create index(:margin_notes, [:entry_id])
    create index(:margin_notes, [:user_id])
    create index(:margin_notes, [:entry_id, :orphaned_at])

    alter table(:entries) do
      add :margin_note_count, :integer, default: 0, null: false
    end

    create index(:entries, [:margin_note_count])
  end
end
