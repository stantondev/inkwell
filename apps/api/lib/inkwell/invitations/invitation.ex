defmodule Inkwell.Invitations.Invitation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "invitations" do
    field :email, :string
    field :token, :string
    field :status, :string, default: "pending"
    field :accepted_at, :utc_datetime_usec
    field :message, :string
    field :expires_at, :utc_datetime_usec

    belongs_to :inviter, Inkwell.Accounts.User
    belongs_to :accepted_by, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(invitation, attrs) do
    invitation
    |> cast(attrs, [:inviter_id, :email, :token, :status, :message, :expires_at, :accepted_by_id, :accepted_at])
    |> validate_required([:inviter_id, :email, :token, :expires_at])
    |> validate_length(:message, max: 500)
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> unique_constraint(:token)
  end
end
