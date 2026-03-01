defmodule Inkwell.Polls.Poll do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "polls" do
    field :question, :string
    field :type, Ecto.Enum, values: [:platform, :entry]
    field :status, Ecto.Enum, values: [:open, :closed], default: :open
    field :max_choices, :integer, default: 1
    field :closes_at, :utc_datetime_usec
    field :closed_at, :utc_datetime_usec
    field :total_votes, :integer, default: 0

    belongs_to :creator, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry
    has_many :options, Inkwell.Polls.PollOption
    has_many :votes, Inkwell.Polls.PollVote

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(poll, attrs) do
    poll
    |> cast(attrs, [:question, :type, :max_choices, :closes_at, :creator_id, :entry_id])
    |> validate_required([:question, :type, :creator_id])
    |> validate_length(:question, min: 3, max: 500)
    |> validate_number(:max_choices, greater_than: 0, less_than_or_equal_to: 10)
    |> validate_inclusion(:type, [:platform, :entry])
  end

  def update_changeset(poll, attrs) do
    poll
    |> cast(attrs, [:question, :closes_at])
    |> validate_required([:question])
    |> validate_length(:question, min: 3, max: 500)
  end

  def close_changeset(poll) do
    poll
    |> change(%{status: :closed, closed_at: DateTime.utc_now() |> DateTime.truncate(:microsecond)})
  end
end
