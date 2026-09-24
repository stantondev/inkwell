defmodule Inkwell.Letters.Conversation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "conversations" do
    field :last_message_at, :utc_datetime_usec
    # nil, or "pending" / "accepted" / "declined" for a letter request.
    field :request_status, :string
    belongs_to :requested_by, Inkwell.Accounts.User, foreign_key: :requested_by_id
    field :requested_at, :utc_datetime_usec

    belongs_to :participant_a_user, Inkwell.Accounts.User, foreign_key: :participant_a
    # nil in a conversation with a fediverse account, which uses remote_actor.
    belongs_to :participant_b_user, Inkwell.Accounts.User, foreign_key: :participant_b
    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema, foreign_key: :remote_actor_id
    field :ap_context, :string

    has_many :messages, Inkwell.Letters.DirectMessage, foreign_key: :conversation_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(conversation, attrs) do
    conversation
    |> cast(attrs, [:participant_a, :participant_b, :last_message_at])
    |> validate_required([:participant_a, :participant_b])
    |> unique_constraint([:participant_a, :participant_b])
  end
end
