defmodule Inkwell.Polls.PollOption do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "poll_options" do
    field :label, :string
    field :position, :integer, default: 0
    field :vote_count, :integer, default: 0

    belongs_to :poll, Inkwell.Polls.Poll

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(option, attrs) do
    option
    |> cast(attrs, [:label, :position, :poll_id])
    |> validate_required([:label, :poll_id])
    |> validate_length(:label, min: 1, max: 200)
  end
end
