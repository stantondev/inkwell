defmodule Inkwell.OAuth.OAuthState do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "oauth_states" do
    field :state, :string
    field :domain, :string
    field :redirect_after, :string
    field :expires_at, :utc_datetime_usec
    # Bluesky only: PKCE verifier, DPoP key, issuer (encrypted, Inkwell.Bluesky.Keys)
    field :data, :string

    belongs_to :linking_user, Inkwell.Accounts.User, foreign_key: :linking_user_id

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(oauth_state, attrs) do
    oauth_state
    |> cast(attrs, [:state, :domain, :redirect_after, :linking_user_id, :expires_at, :data])
    |> validate_required([:state, :domain, :expires_at])
    |> unique_constraint(:state)
  end
end
