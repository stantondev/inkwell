defmodule Inkwell.Repo.Migrations.AddPlusMemberSinceAndRealImageSizes do
  use Ecto.Migration

  def up do
    # When the account first became paid Plus. Plus image storage grows by
    # 1 GB for every full year since this date (see Inkwell.Storage).
    alter table(:users) do
      add :plus_member_since, :utc_datetime_usec
    end

    flush()

    # Founding Members have been Plus since they bought in. Subscribers are
    # backfilled from Square after deploy; anyone else gets stamped the next
    # time their subscription is written.
    execute """
    UPDATE users SET plus_member_since = founding_member_at
    WHERE founding_member_number IS NOT NULL AND plus_member_since IS NULL
    """

    # Uploads through POST /api/images recorded the base64 length (~33% more
    # than the file). Convert those rows to the real decoded size so the quota
    # counts actual bytes. Computed from the base64 length and padding only —
    # nothing is decoded, so malformed data cannot fail the migration. Rows
    # already storing the real size (Post by Email, imports) don't match the
    # WHERE clause and are left alone.
    execute """
    UPDATE entry_images
    SET byte_size = (length(b64) / 4) * 3 - (length(b64) - length(rtrim(b64, '=')))
    FROM (
      SELECT id AS img_id, substring(data from position(',' in data) + 1) AS b64
      FROM entry_images
    ) src
    WHERE entry_images.id = src.img_id
      AND length(src.b64) % 4 = 0
      AND entry_images.byte_size = length(src.b64)
    """
  end

  def down do
    alter table(:users) do
      remove :plus_member_since
    end

    # Image sizes are not converted back: the real size is the correct value.
  end
end
