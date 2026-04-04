defmodule Inkwell.Auth.AuthToken do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "auth_tokens" do
    field :token, :string
    field :type, :string  # "magic_link", "api_session", or "email_change"
    field :expires_at, :utc_datetime_usec
    field :data, :map

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(auth_token, attrs) do
    auth_token
    |> cast(attrs, [:token, :user_id, :type, :expires_at, :data])
    |> validate_required([:token, :user_id, :type, :expires_at])
    |> validate_inclusion(:type, ["magic_link", "api_session", "email_change"])
    |> unique_constraint(:token)
  end
end
