defmodule Inkwell.Feedback.FeedbackPost do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "feedback_posts" do
    field :title, :string
    field :body, :string
    field :category, Ecto.Enum, values: [:bug, :feature, :idea, :question]
    field :status, Ecto.Enum, values: [:new, :under_review, :planned, :in_progress, :done, :declined]
    field :admin_response, :string
    field :release_note, :string
    field :completed_at, :utc_datetime_usec
    field :vote_count, :integer, default: 0
    field :comment_count, :integer, default: 0

    belongs_to :user, Inkwell.Accounts.User
    has_many :votes, Inkwell.Feedback.FeedbackVote
    has_many :comments, Inkwell.Feedback.FeedbackComment

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(post, attrs) do
    post
    |> cast(attrs, [:title, :body, :category, :user_id])
    |> validate_required([:title, :body, :category, :user_id])
    |> validate_length(:title, min: 3, max: 200)
    |> validate_length(:body, min: 10, max: 5000)
    |> validate_inclusion(:category, [:bug, :feature, :idea, :question])
  end

  def admin_changeset(post, attrs) do
    post
    |> cast(attrs, [:status, :admin_response, :release_note])
    |> validate_inclusion(:status, [:new, :under_review, :planned, :in_progress, :done, :declined])
    |> validate_length(:admin_response, max: 5000)
    |> validate_length(:release_note, max: 5000)
    |> maybe_set_completed_at()
  end

  defp maybe_set_completed_at(changeset) do
    case get_change(changeset, :status) do
      :done ->
        if is_nil(get_field(changeset, :completed_at)) do
          put_change(changeset, :completed_at, DateTime.utc_now() |> DateTime.truncate(:microsecond))
        else
          changeset
        end

      nil ->
        changeset

      _other_status ->
        put_change(changeset, :completed_at, nil)
    end
  end
end
