defmodule Inkwell.OAuth.OAuthAppRegistration do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "oauth_app_registrations" do
    field :domain, :string
    field :client_id, :string
    field :client_secret, :string
    field :redirect_uri, :string
    field :scopes, :string, default: "read"

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(registration, attrs) do
    registration
    |> cast(attrs, [:domain, :client_id, :client_secret, :redirect_uri, :scopes])
    |> validate_required([:domain, :client_id, :client_secret, :redirect_uri])
    |> unique_constraint(:domain)
  end
end
