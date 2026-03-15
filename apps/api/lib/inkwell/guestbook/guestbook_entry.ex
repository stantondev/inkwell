defmodule Inkwell.Guestbook.GuestbookEntry do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "guestbook_entries" do
    field :body, :string
    field :remote_author, :map
    field :ap_id, :string

    belongs_to :profile_user, Inkwell.Accounts.User
    belongs_to :author, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:body, :profile_user_id, :author_id])
    |> validate_required([:body, :profile_user_id, :author_id])
    |> validate_length(:body, min: 1, max: 500)
    |> foreign_key_constraint(:profile_user_id)
    |> foreign_key_constraint(:author_id)
  end

  @doc "Changeset for federated guestbook entries from ActivityPub."
  def ap_changeset(entry, attrs) do
    entry
    |> cast(attrs, [:body, :profile_user_id, :remote_author, :ap_id])
    |> validate_required([:body, :profile_user_id, :remote_author, :ap_id])
    |> validate_length(:body, min: 1, max: 500)
    |> unique_constraint(:ap_id)
    |> foreign_key_constraint(:profile_user_id)
  end
end
