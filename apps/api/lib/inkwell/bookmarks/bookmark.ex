defmodule Inkwell.Bookmarks.Bookmark do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bookmarks" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(bookmark, attrs) do
    bookmark
    |> cast(attrs, [:user_id, :entry_id])
    |> validate_required([:user_id, :entry_id])
    |> unique_constraint([:user_id, :entry_id])
  end
end
