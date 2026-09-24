defmodule Inkwell.Repo.Migrations.UniqueFederatedCommentApId do
  use Ecto.Migration

  # One comment per fediverse post. A reply that mentions two members is
  # delivered twice at once (the shared inbox and one member's inbox); both
  # deliveries checked "have we seen this?" before either had saved, and both
  # saved (2026-09-24, a reply from @jon@henshaw.social).
  #
  # Only comments from the fediverse (remote_author set) are covered: comments
  # written here carry a throwaway ap_id that isn't unique and isn't used.
  #
  # Existing duplicates are merged first: replies move to the earliest copy,
  # then the later copies go.
  def up do
    execute("""
    WITH ranked AS (
      SELECT id, ap_id,
             first_value(id) OVER (PARTITION BY ap_id ORDER BY inserted_at, id) AS keep_id
      FROM comments
      WHERE remote_author IS NOT NULL AND ap_id IS NOT NULL
    )
    UPDATE comments c SET parent_comment_id = r.keep_id
    FROM ranked r
    WHERE c.parent_comment_id = r.id AND r.id <> r.keep_id
    """)

    execute("""
    WITH ranked AS (
      SELECT id,
             first_value(id) OVER (PARTITION BY ap_id ORDER BY inserted_at, id) AS keep_id
      FROM comments
      WHERE remote_author IS NOT NULL AND ap_id IS NOT NULL
    )
    DELETE FROM comments c USING ranked r
    WHERE c.id = r.id AND r.id <> r.keep_id
    """)

    create unique_index(:comments, [:ap_id],
             where: "remote_author IS NOT NULL AND ap_id IS NOT NULL",
             name: :comments_remote_ap_id_index
           )
  end

  def down do
    drop index(:comments, [:ap_id], name: :comments_remote_ap_id_index)
  end
end
