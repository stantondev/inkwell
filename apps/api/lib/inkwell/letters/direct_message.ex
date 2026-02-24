defmodule Inkwell.Letters.DirectMessage do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "direct_messages" do
    field :body, :string
    field :deleted_by_a, :boolean, default: false
    field :deleted_by_b, :boolean, default: false

    belongs_to :conversation, Inkwell.Letters.Conversation
    belongs_to :sender, Inkwell.Accounts.User, foreign_key: :sender_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [:conversation_id, :sender_id, :body])
    |> validate_required([:conversation_id, :sender_id, :body])
    |> validate_length(:body, min: 1, max: 2000)
  end
end
