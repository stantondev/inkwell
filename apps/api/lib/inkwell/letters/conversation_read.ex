defmodule Inkwell.Letters.ConversationRead do
  use Ecto.Schema
  import Ecto.Changeset

  @foreign_key_type :binary_id
  @primary_key false

  schema "conversation_reads" do
    field :conversation_id, :binary_id, primary_key: true
    field :user_id, :binary_id, primary_key: true
    field :last_read_at, :utc_datetime_usec
  end

  def changeset(read, attrs) do
    read
    |> cast(attrs, [:conversation_id, :user_id, :last_read_at])
    |> validate_required([:conversation_id, :user_id, :last_read_at])
  end
end
