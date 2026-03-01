defmodule Inkwell.Polls.PollComment do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "poll_comments" do
    field :body, :string

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :poll, Inkwell.Polls.Poll

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(comment, attrs) do
    comment
    |> cast(attrs, [:body, :user_id, :poll_id])
    |> validate_required([:body, :user_id, :poll_id])
    |> validate_length(:body, min: 1, max: 6000)
  end
end
