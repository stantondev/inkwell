defmodule Inkwell.Feedback.FeedbackVote do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "feedback_votes" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :feedback_post, Inkwell.Feedback.FeedbackPost

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(vote, attrs) do
    vote
    |> cast(attrs, [:user_id, :feedback_post_id])
    |> validate_required([:user_id, :feedback_post_id])
    |> unique_constraint([:user_id, :feedback_post_id])
  end
end
