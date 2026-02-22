defmodule Inkwell.Repo.Migrations.FixMutualRelationships do
  use Ecto.Migration

  @doc """
  Fixes existing accepted relationships that should be mutual.
  When user A accepted user B's follow request, only B→A was set to accepted.
  This migration creates the reverse A→B relationship as accepted + mutual,
  and marks B→A as mutual too.
  """
  def up do
    # Find all accepted relationships that don't have a reverse
    execute """
    INSERT INTO relationships (id, follower_id, following_id, status, is_mutual, inserted_at, updated_at)
    SELECT
      gen_random_uuid(),
      r.following_id,
      r.follower_id,
      'accepted',
      true,
      NOW(),
      NOW()
    FROM relationships r
    WHERE r.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1 FROM relationships r2
        WHERE r2.follower_id = r.following_id
          AND r2.following_id = r.follower_id
      )
    """

    # Mark all pairs where both directions are accepted as mutual
    execute """
    UPDATE relationships r1
    SET is_mutual = true
    WHERE r1.status = 'accepted'
      AND EXISTS (
        SELECT 1 FROM relationships r2
        WHERE r2.follower_id = r1.following_id
          AND r2.following_id = r1.follower_id
          AND r2.status = 'accepted'
      )
    """
  end

  def down do
    # Can't cleanly reverse this — would require knowing which were auto-created
    :ok
  end
end
