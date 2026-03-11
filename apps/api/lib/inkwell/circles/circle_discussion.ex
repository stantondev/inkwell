defmodule Inkwell.Circles.CircleDiscussion do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "circle_discussions" do
    field :title, :string
    field :body, :string
    field :body_html, :string
    field :is_prompt, :boolean, default: false
    field :is_pinned, :boolean, default: false
    field :is_locked, :boolean, default: false
    field :response_count, :integer, default: 0
    field :last_response_at, :utc_datetime_usec
    field :edited_at, :utc_datetime_usec

    belongs_to :circle, Inkwell.Circles.Circle
    belongs_to :author, Inkwell.Accounts.User
    has_many :responses, Inkwell.Circles.CircleResponse, foreign_key: :discussion_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(discussion, attrs) do
    discussion
    |> cast(attrs, [:title, :body, :body_html, :circle_id, :author_id, :is_prompt, :is_pinned])
    |> validate_required([:title, :body, :circle_id, :author_id])
    |> validate_length(:title, min: 1, max: 300)
    |> validate_length(:body, min: 1, max: 50_000)
    |> validate_length(:body_html, max: 100_000)
  end

  def edit_changeset(discussion, attrs) do
    discussion
    |> cast(attrs, [:title, :body, :body_html])
    |> validate_required([:body])
    |> validate_length(:title, min: 1, max: 300)
    |> validate_length(:body, min: 1, max: 50_000)
    |> validate_length(:body_html, max: 100_000)
    |> put_change(:edited_at, DateTime.utc_now() |> DateTime.truncate(:microsecond))
  end
end
