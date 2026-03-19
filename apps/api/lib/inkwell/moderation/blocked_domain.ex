defmodule Inkwell.Moderation.BlockedDomain do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "blocked_domains" do
    belongs_to :user, Inkwell.Accounts.User
    field :domain, :string
    field :reason, :string
    field :blocked_by_admin, :boolean, default: false

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(block, attrs) do
    block
    |> cast(attrs, [:user_id, :domain, :reason, :blocked_by_admin])
    |> validate_required([:domain])
    |> update_change(:domain, &String.downcase(String.trim(&1)))
    |> validate_length(:domain, max: 253)
    |> validate_length(:reason, max: 500)
    |> validate_format(:domain, ~r/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, message: "must be a valid domain name")
  end

  def admin_changeset(block, attrs) do
    block
    |> cast(attrs, [:domain, :reason])
    |> validate_required([:domain])
    |> put_change(:blocked_by_admin, true)
    |> put_change(:user_id, nil)
    |> update_change(:domain, &String.downcase(String.trim(&1)))
    |> validate_length(:domain, max: 253)
    |> validate_length(:reason, max: 500)
    |> validate_format(:domain, ~r/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, message: "must be a valid domain name")
  end
end
