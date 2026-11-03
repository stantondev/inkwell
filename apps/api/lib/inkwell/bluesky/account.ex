defmodule Inkwell.Bluesky.Account do
  @moduledoc """
  A member's linked Bluesky account. `session` is encrypted
  (`Inkwell.Bluesky.Keys`) and holds the access and refresh tokens and the
  session's DPoP key; nothing else here is secret.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bluesky_accounts" do
    field :did, :string
    field :handle, :string
    field :display_name, :string
    field :avatar_url, :string
    field :pds_url, :string
    field :auth_server, :string
    field :scope, :string
    field :session, :string
    field :access_expires_at, :utc_datetime_usec
    field :remote_created_at, :utc_datetime_usec
    field :posts_count, :integer
    field :followers_count, :integer
    field :last_verified_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(account, attrs) do
    account
    |> cast(attrs, [
      :user_id, :did, :handle, :display_name, :avatar_url, :pds_url, :auth_server, :scope,
      :session, :access_expires_at, :remote_created_at, :posts_count, :followers_count,
      :last_verified_at
    ])
    |> validate_required([:user_id, :did])
    |> validate_length(:display_name, max: 255)
    |> unique_constraint(:did)
    |> unique_constraint(:user_id)
    |> foreign_key_constraint(:user_id)
  end

  @doc "True when the session can post (asked for more than sign-in)."
  def can_post?(%__MODULE__{scope: scope, session: session}) when is_binary(scope) and is_binary(session),
    do: "transition:generic" in String.split(scope)

  def can_post?(_), do: false
end
