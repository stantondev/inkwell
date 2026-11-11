defmodule Inkwell.PenPalExchange.Request do
  @moduledoc "One member's ask to be introduced to a pen pal."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "pen_pal_exchange_requests" do
    field :note, :string
    field :status, :string, default: "waiting"
    field :matched_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :partner, Inkwell.Accounts.User
    belongs_to :conversation, Inkwell.Letters.Conversation

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(request, attrs) do
    request
    |> cast(attrs, [:user_id, :note])
    |> validate_required([:user_id])
    |> update_change(:note, &clean_note/1)
    |> validate_length(:note, max: 200)
    |> unique_constraint(:user_id, name: :pen_pal_exchange_one_waiting)
  end

  # One line of plain text: no line breaks, no markup to render.
  defp clean_note(nil), do: nil

  defp clean_note(note) do
    case note |> String.replace(~r/\s+/u, " ") |> String.trim() do
      "" -> nil
      text -> text
    end
  end
end
