defmodule Inkwell.OAuth.FediverseAccount do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "fediverse_accounts" do
    field :domain, :string
    field :remote_username, :string
    field :remote_acct, :string
    field :remote_actor_uri, :string
    field :remote_display_name, :string
    field :remote_avatar_url, :string
    field :access_token, :string
    field :token_scope, :string, default: "read"
    field :last_verified_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(account, attrs) do
    account
    |> cast(attrs, [
      :user_id, :domain, :remote_username, :remote_acct,
      :remote_actor_uri, :remote_display_name, :remote_avatar_url,
      :access_token, :token_scope, :last_verified_at
    ])
    |> validate_required([:user_id, :domain, :remote_username, :remote_acct])
    |> unique_constraint([:domain, :remote_username])
    |> foreign_key_constraint(:user_id)
  end
end
