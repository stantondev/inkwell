defmodule Inkwell.Push.Device do
  @moduledoc "A phone running the Inkwell app, reached through Firebase Cloud Messaging."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "push_devices" do
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :auth_token, Inkwell.Auth.AuthToken
    field :token, :string
    field :platform, :string, default: "android"
    field :app_version, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(device, attrs) do
    device
    |> cast(attrs, [:user_id, :auth_token_id, :token, :platform, :app_version])
    |> validate_required([:user_id, :token, :platform])
    |> validate_length(:token, min: 20, max: 4096)
    |> validate_inclusion(:platform, ~w(android ios))
    |> validate_length(:app_version, max: 40)
    |> unique_constraint(:token)
  end
end
