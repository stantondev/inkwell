defmodule Inkwell.Journals.Comment do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "comments" do
    field :body_html, :string
    field :ap_id, :string
    field :remote_author, :map
    field :depth, :integer, default: 0

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :parent_comment, Inkwell.Journals.Comment
    belongs_to :user_icon, Inkwell.Accounts.UserIcon
    has_many :replies, Inkwell.Journals.Comment, foreign_key: :parent_comment_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(comment, attrs) do
    comment
    |> cast(attrs, [:body_html, :entry_id, :user_id, :parent_comment_id, :user_icon_id, :remote_author])
    |> validate_required([:body_html, :entry_id])
    |> validate_has_author()
    |> compute_depth()
  end

  defp validate_has_author(changeset) do
    user_id = get_field(changeset, :user_id)
    remote_author = get_field(changeset, :remote_author)

    if is_nil(user_id) and is_nil(remote_author) do
      add_error(changeset, :user_id, "either user_id or remote_author must be present")
    else
      changeset
    end
  end

  defp compute_depth(changeset) do
    case get_change(changeset, :parent_comment_id) do
      nil -> changeset
      _parent_id ->
        # Depth will be computed in the context module when parent is loaded
        changeset
    end
  end
end
