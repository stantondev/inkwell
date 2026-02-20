defmodule Inkwell.Auth.AuthToken do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "auth_tokens" do
    field :token, :string
    field :type, :string  # "magic_link" or "api_session"
    field :expires_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(auth_token, attrs) do
    auth_token
    |> cast(attrs, [:token, :user_id, :type, :expires_at])
    |> validate_required([:token, :user_id, :type, :expires_at])
    |> validate_inclusion(:type, ["magic_link", "api_session"])
    |> unique_constraint(:token)
  end
end
