defmodule Inkwell.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :username, :string
    field :email, :string
    field :display_name, :string
    field :bio, :string
    field :pronouns, :string
    field :avatar_url, :string
    field :profile_html, :string
    field :profile_css, :string
    field :ap_id, :string
    field :public_key, :string
    field :private_key, :string
    field :settings, :map, default: %{}

    # Subscription / billing
    field :stripe_customer_id, :string
    field :stripe_subscription_id, :string
    field :subscription_tier, :string, default: "free"
    field :subscription_status, :string, default: "none"
    field :subscription_expires_at, :utc_datetime_usec

    has_many :entries, Inkwell.Journals.Entry
    has_many :user_icons, Inkwell.Accounts.UserIcon
    has_many :notifications, Inkwell.Accounts.Notification

    timestamps(type: :utc_datetime_usec)
  end

  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :email, :display_name])
    |> validate_required([:username, :email])
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]{3,30}$/, message: "must be 3-30 alphanumeric characters or underscores")
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> unique_constraint(:username)
    |> unique_constraint(:email)
    |> generate_ap_id()
    |> generate_keys()
  end

  def username_changeset(user, attrs) do
    user
    |> cast(attrs, [:username])
    |> validate_required([:username])
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]{3,30}$/, message: "must be 3-30 alphanumeric characters or underscores")
    |> unique_constraint(:username)
    |> generate_ap_id()
  end

  def subscription_changeset(user, attrs) do
    user
    |> cast(attrs, [:stripe_customer_id, :stripe_subscription_id, :subscription_tier, :subscription_status, :subscription_expires_at])
  end

  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, [:display_name, :bio, :pronouns, :avatar_url, :profile_html, :profile_css, :settings])
    |> validate_length(:bio, max: 2000)
    |> validate_length(:display_name, max: 100)
  end

  defp generate_ap_id(changeset) do
    case get_change(changeset, :username) do
      nil -> changeset
      username -> put_change(changeset, :ap_id, "https://inkwell.social/users/#{username}")
    end
  end

  defp generate_keys(changeset) do
    if get_change(changeset, :username) do
      {pub, priv} = generate_rsa_keypair()
      changeset
      |> put_change(:public_key, pub)
      |> put_change(:private_key, priv)
    else
      changeset
    end
  end

  defp generate_rsa_keypair do
    key = :public_key.generate_key({:rsa, 2048, 65537})
    private_pem = :public_key.pem_encode([:public_key.pem_entry_encode(:RSAPrivateKey, key)])
    public_key = {:RSAPublicKey, elem(key, 2), elem(key, 3)}
    public_pem = :public_key.pem_encode([:public_key.pem_entry_encode(:SubjectPublicKeyInfo, public_key)])
    {public_pem, private_pem}
  end
end
