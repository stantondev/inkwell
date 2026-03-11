defmodule Inkwell.Circles.CircleResponse do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "circle_responses" do
    field :body, :string
    field :body_html, :string
    field :edited_at, :utc_datetime_usec

    belongs_to :discussion, Inkwell.Circles.CircleDiscussion
    belongs_to :author, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(response, attrs) do
    response
    |> cast(attrs, [:body, :body_html, :discussion_id, :author_id])
    |> validate_required([:body, :discussion_id, :author_id])
    |> validate_length(:body, min: 1, max: 6000)
    |> validate_length(:body_html, max: 12_000)
  end

  def edit_changeset(response, attrs) do
    response
    |> cast(attrs, [:body, :body_html])
    |> validate_required([:body])
    |> validate_length(:body, min: 1, max: 6000)
    |> validate_length(:body_html, max: 12_000)
    |> put_change(:edited_at, DateTime.utc_now() |> DateTime.truncate(:microsecond))
  end
end
