defmodule Inkwell.ApiKeys.ApiKey do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "api_keys" do
    field :name, :string
    field :prefix, :string
    field :key_hash, :string
    field :scopes, {:array, :string}, default: ["read"]
    field :last_used_at, :utc_datetime_usec
    field :expires_at, :utc_datetime_usec
    field :revoked_at, :utc_datetime_usec

    # Virtual field — only populated at creation time, never persisted
    field :raw_key, :string, virtual: true

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  @valid_scopes ["read", "write"]

  def create_changeset(api_key, attrs) do
    api_key
    |> cast(attrs, [:name, :scopes, :expires_at, :user_id])
    |> validate_required([:name, :scopes, :user_id])
    |> validate_length(:name, max: 100)
    |> validate_scopes()
    |> validate_expires_in_future()
    |> generate_key()
  end

  def revoke_changeset(api_key) do
    api_key
    |> change(%{revoked_at: DateTime.utc_now()})
  end

  defp validate_scopes(changeset) do
    case get_field(changeset, :scopes) do
      nil -> changeset
      scopes ->
        if Enum.all?(scopes, &(&1 in @valid_scopes)) and "read" in scopes do
          changeset
        else
          add_error(changeset, :scopes, "must include 'read' and only contain valid scopes (read, write)")
        end
    end
  end

  defp validate_expires_in_future(changeset) do
    case get_field(changeset, :expires_at) do
      nil -> changeset
      expires_at ->
        if DateTime.compare(expires_at, DateTime.utc_now()) == :gt do
          changeset
        else
          add_error(changeset, :expires_at, "must be in the future")
        end
    end
  end

  defp generate_key(changeset) do
    if changeset.valid? do
      raw_key = "ink_" <> (:crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false))
      prefix = String.slice(raw_key, 0, 8)
      key_hash = :crypto.hash(:sha256, raw_key) |> Base.encode16(case: :lower)

      changeset
      |> put_change(:raw_key, raw_key)
      |> put_change(:prefix, prefix)
      |> put_change(:key_hash, key_hash)
    else
      changeset
    end
  end
end
