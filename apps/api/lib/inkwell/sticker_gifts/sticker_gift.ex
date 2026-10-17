defmodule Inkwell.StickerGifts.StickerGift do
  @moduledoc "A sticker one pen pal gave another (Inkwell.StickerGifts)."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "sticker_gifts" do
    belongs_to :sender, Inkwell.Accounts.User
    belongs_to :recipient, Inkwell.Accounts.User
    belongs_to :image, Inkwell.Journals.EntryImage
    field :key, :string
    field :ratio, :float, default: 1.0
    field :outline, :boolean, default: true
    field :note, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(gift, attrs) do
    gift
    |> cast(attrs, [:sender_id, :recipient_id, :key, :image_id, :ratio, :outline, :note])
    |> validate_required([:sender_id, :recipient_id, :key])
    |> validate_length(:note, max: 140)
    |> validate_number(:ratio, greater_than_or_equal_to: 0.1, less_than_or_equal_to: 10)
  end
end
