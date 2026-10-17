defmodule Inkwell.Repo.Migrations.CreateStickerGifts do
  use Ecto.Migration

  def change do
    create table(:sticker_gifts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sender_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :recipient_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      # A pack key ("stamp", "rose"…) or "upload" for one of the giver's own stickers.
      add :key, :string, size: 40, null: false
      # For "upload": the giver's picture. Goes if the picture does.
      add :image_id, references(:entry_images, type: :binary_id, on_delete: :delete_all)
      add :ratio, :float, default: 1.0, null: false
      add :outline, :boolean, default: true, null: false
      add :note, :string, size: 140

      timestamps(type: :utc_datetime_usec)
    end

    create index(:sticker_gifts, [:recipient_id])
    create index(:sticker_gifts, [:sender_id, :inserted_at])
    create index(:sticker_gifts, [:image_id])
  end
end
