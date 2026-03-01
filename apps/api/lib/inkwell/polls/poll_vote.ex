defmodule Inkwell.Polls.PollVote do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "poll_votes" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :poll, Inkwell.Polls.Poll
    belongs_to :poll_option, Inkwell.Polls.PollOption

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(vote, attrs) do
    vote
    |> cast(attrs, [:user_id, :poll_id, :poll_option_id])
    |> validate_required([:user_id, :poll_id, :poll_option_id])
    |> unique_constraint([:user_id, :poll_id], message: "You have already voted on this poll")
  end
end
