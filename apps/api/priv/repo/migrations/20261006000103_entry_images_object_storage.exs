defmodule Inkwell.Repo.Migrations.EntryImagesObjectStorage do
  use Ecto.Migration

  # Uploaded images move from base64 text in `entry_images.data` to object
  # storage (Inkwell.ObjectStore). A row then holds `storage_key` and no
  # `data`. Rows not yet moved (and every row on a server without a bucket)
  # keep `data` as before.
  #
  # Deleting a row has to delete its object too, and rows disappear in many
  # ways: the orphan cleanup, and ON DELETE CASCADE when an account goes. A
  # trigger catches all of them by queueing the key in
  # `object_store_deletions`, which ObjectStoreDeletionWorker drains.
  def up do
    alter table(:entry_images) do
      add :storage_key, :string
      modify :data, :text, null: true
    end

    create constraint(:entry_images, :entry_images_data_or_storage_key,
             check: "data IS NOT NULL OR storage_key IS NOT NULL"
           )

    create table(:object_store_deletions) do
      add :key, :string, null: false
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    execute """
    CREATE FUNCTION queue_entry_image_object_deletion() RETURNS trigger AS $$
    BEGIN
      IF OLD.storage_key IS NOT NULL THEN
        INSERT INTO object_store_deletions (key) VALUES (OLD.storage_key);
      END IF;
      RETURN OLD;
    END
    $$ LANGUAGE plpgsql
    """

    execute """
    CREATE TRIGGER entry_images_queue_object_deletion
    AFTER DELETE ON entry_images
    FOR EACH ROW EXECUTE FUNCTION queue_entry_image_object_deletion()
    """
  end

  def down do
    execute "DROP TRIGGER IF EXISTS entry_images_queue_object_deletion ON entry_images"
    execute "DROP FUNCTION IF EXISTS queue_entry_image_object_deletion()"
    drop table(:object_store_deletions)
    drop constraint(:entry_images, :entry_images_data_or_storage_key)

    alter table(:entry_images) do
      remove :storage_key
    end
  end
end
