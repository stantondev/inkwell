defmodule Inkwell.Federation.RemoteActorSchema do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "remote_actors" do
    field :ap_id, :string
    field :username, :string
    field :domain, :string
    field :display_name, :string
    field :avatar_url, :string
    field :inbox, :string
    field :shared_inbox, :string
    field :public_key_pem, :string
    field :raw_data, :map

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(actor, attrs) do
    actor
    |> cast(attrs, [
      :ap_id, :username, :domain, :display_name, :avatar_url,
      :inbox, :shared_inbox, :public_key_pem, :raw_data
    ])
    |> validate_required([:ap_id, :inbox, :public_key_pem])
    |> unique_constraint(:ap_id)
  end
end
