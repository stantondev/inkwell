defmodule Inkwell.Repo.Migrations.AddPerformanceIndexes do
  @moduledoc """
  Adds missing indexes identified during the 2026-04-29 optimization audit.

  All indexes are created `concurrently: true` so production stays online.
  Each is `if_not_exists` so the migration is safe to re-run.

  Hot paths these unblock:

  1. inks(remote_entry_id) — `count_inks_for_remote_entries` is called ~3x
     per Explore page render. Currently does bitmap-or-seq scan.

  2. relationships(follower_id, status) + (following_id, status) —
     get_blocked_user_ids, list_friend_ids, list_followers, count_followers,
     count_following all filter on these combos. Currently the leftmost-prefix
     of the unique index covers one column but heap-fetches to filter status.

  3. entries explore feed covering index — list_public_explore_entries
     filters on status='published' AND sensitive=false AND admin_sensitive=false
     AND privacy IN (:public, :paid) ORDER BY published_at DESC. Existing
     [:privacy, :published_at] doesn't include the boolean filters.

  4. users square subscription IDs — webhook handlers look up users by
     square_subscription_id / square_donor_subscription_id. Sequential
     scan today; matters more as user count grows.

  5. conversations(participant_b) — list_conversations does
     `WHERE participant_a = ? OR participant_b = ?`. The unique compound
     [:participant_a, :participant_b] covers participant_a only.

  6. notifications cleanup partial index — daily cleanup deletes
     `WHERE read = true AND inserted_at < ?` across all users. Without
     this, full table scan.

  Also drops the unused single-column relationships(:status) index — it has
  3 distinct values across the whole table and is never selectively useful;
  Postgres planner ignores it. Dropping reduces write overhead on every
  follow/unfollow/block.
  """

  use Ecto.Migration

  # Required for `concurrently: true` — Postgres can't build indexes
  # concurrently inside a transaction.
  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    # 1. inks: remote_entry_id batch lookups for Explore pages.
    create_if_not_exists index(
      :inks,
      [:remote_entry_id],
      where: "remote_entry_id IS NOT NULL",
      concurrently: true
    )

    # 2 + 3. relationships: hot follower/following filters with status.
    create_if_not_exists index(
      :relationships,
      [:follower_id, :status],
      concurrently: true
    )

    create_if_not_exists index(
      :relationships,
      [:following_id, :status],
      concurrently: true
    )

    # Drop the unused low-cardinality :status index — superseded by the
    # compound indexes above.
    drop_if_exists index(:relationships, [:status])

    # 4. users: Square subscription / Stripe Connect lookups for webhooks.
    create_if_not_exists index(
      :users,
      [:square_subscription_id],
      where: "square_subscription_id IS NOT NULL",
      concurrently: true
    )

    create_if_not_exists index(
      :users,
      [:square_donor_subscription_id],
      where: "square_donor_subscription_id IS NOT NULL",
      concurrently: true
    )

    create_if_not_exists index(
      :users,
      [:stripe_connect_account_id],
      where: "stripe_connect_account_id IS NOT NULL",
      concurrently: true
    )

    # 5. conversations: support OR-query in list_conversations.
    create_if_not_exists index(
      :conversations,
      [:participant_b],
      concurrently: true
    )

    # 6. entries: covering index for the public explore feed query.
    # Filters: status='published' AND sensitive=false AND admin_sensitive=false
    # AND published_at IS NOT NULL, sorted by published_at DESC.
    create_if_not_exists index(
      :entries,
      [:privacy, :published_at],
      where:
        "status = 'published' AND sensitive = false AND admin_sensitive = false AND published_at IS NOT NULL",
      name: :entries_explore_feed_index,
      concurrently: true
    )

    # 7. notifications: cleanup worker (daily, deletes read notifications
    # older than 90 days across all users).
    create_if_not_exists index(
      :notifications,
      [:inserted_at],
      where: "read = true",
      name: :notifications_cleanup_index,
      concurrently: true
    )

    # 8. notifications: follow-request operations (mark/delete by actor).
    create_if_not_exists index(
      :notifications,
      [:user_id, :actor_id, :type],
      where: "actor_id IS NOT NULL",
      concurrently: true
    )

    # 9. entries: drafts list (user_id + status='draft' ORDER BY updated_at DESC).
    # Existing [:user_id, :status] satisfies WHERE but not ORDER BY.
    create_if_not_exists index(
      :entries,
      [:user_id, :updated_at],
      where: "status = 'draft'",
      name: :entries_drafts_index,
      concurrently: true
    )
  end
end
