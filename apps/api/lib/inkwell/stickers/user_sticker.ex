defmodule Inkwell.Stickers.UserSticker do
  @moduledoc "A sticker a writer made from their own picture (Inkwell.Stickers)."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_stickers" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :image, Inkwell.Journals.EntryImage
    field :name, :string
    field :outline, :boolean, default: true
    field :ratio, :float, default: 1.0

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(sticker, attrs) do
    sticker
    |> cast(attrs, [:user_id, :image_id, :name, :outline, :ratio])
    |> validate_required([:user_id, :image_id])
    |> update_change(:name, &(&1 |> String.trim() |> String.slice(0, 60)))
    |> validate_number(:ratio, greater_than_or_equal_to: 0.1, less_than_or_equal_to: 10)
    |> unique_constraint(:image_id)
  end
end
