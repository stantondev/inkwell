defmodule Inkwell.Repo.Migrations.BackfillWordCountsAndImportSource do
  use Ecto.Migration

  # Two data fixes for the drafts work (2026-10-11):
  #
  # 1. Word counts were only computed by the editor's endpoints, so imports,
  #    stickies and Post by Email were stored with 0 words (472 entries in
  #    production, 207 of them published). Entry changesets now compute it on
  #    every save; this fills in the rows already stored. Words are tokens with
  #    a letter or digit, after tags and non-breaking spaces become spaces,
  #    matching Entry.count_words/1.
  #
  # 2. Imports from before `source: "import"` existed (WordPress moves in
  #    April-June 2026) have no source, so their drafts counted toward the
  #    free draft limit. Ten or more entries created by one writer in the same
  #    minute is an import (checked by hand in production: every match was).
  def up do
    execute("""
    UPDATE entries e
    SET word_count = (
      SELECT count(*)
      FROM regexp_split_to_table(
        regexp_replace(
          regexp_replace(coalesce(e.body_html, ''), '<[^>]+>', ' ', 'g'),
          '&(nbsp|#160|#xa0);', ' ', 'gi'),
        '\\s+') AS t(word)
      WHERE t.word ~ '[[:alnum:]]'
    )
    WHERE coalesce(e.word_count, 0) = 0 AND length(coalesce(e.body_html, '')) > 0
    """)

    execute("""
    WITH bursts AS (
      SELECT user_id, date_trunc('minute', inserted_at) AS minute
      FROM entries
      WHERE source IS NULL AND kind = 'entry'
      GROUP BY 1, 2
      HAVING count(*) >= 10
    )
    UPDATE entries e
    SET source = 'import'
    FROM bursts b
    WHERE e.user_id = b.user_id
      AND date_trunc('minute', e.inserted_at) = b.minute
      AND e.source IS NULL
      AND e.kind = 'entry'
    """)
  end

  def down, do: :ok
end
