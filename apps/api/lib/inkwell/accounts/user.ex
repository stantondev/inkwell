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
    field :profile_music, :string
    field :profile_background_url, :string
    field :profile_background_color, :string
    field :profile_accent_color, :string
    field :profile_foreground_color, :string
    field :profile_font, :string
    field :profile_layout, :string
    field :profile_widgets, :map, default: %{}
    field :profile_status, :string
    field :profile_theme, :string
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

  @allowed_fonts ~w[default lora courier georgia comic-sans times palatino verdana]
  @allowed_layouts ~w[classic wide minimal magazine]
  @allowed_themes ~w[default cottagecore vaporwave dark-academia retro-web midnight pastel ocean]

  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :display_name, :bio, :pronouns, :avatar_url,
      :profile_html, :profile_css, :settings,
      :profile_music, :profile_background_url, :profile_background_color,
      :profile_accent_color, :profile_foreground_color, :profile_font, :profile_layout,
      :profile_widgets, :profile_status, :profile_theme
    ])
    |> validate_length(:bio, max: 2000)
    |> validate_length(:display_name, max: 100)
    |> validate_length(:profile_status, max: 280)
    |> validate_length(:profile_music, max: 500)
    |> validate_length(:profile_html, max: 50_000)
    |> validate_length(:profile_css, max: 50_000)
    |> maybe_validate_format(:profile_background_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_format(:profile_accent_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_format(:profile_foreground_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_inclusion(:profile_font, @allowed_fonts)
    |> maybe_validate_inclusion(:profile_layout, @allowed_layouts)
    |> maybe_validate_inclusion(:profile_theme, @allowed_themes)
  end

  # Only validate format/inclusion when the field is actually being changed (not nil)
  defp maybe_validate_format(changeset, field, format, opts) do
    case get_change(changeset, field) do
      nil -> changeset
      "" -> changeset
      _ -> validate_format(changeset, field, format, opts)
    end
  end

  defp maybe_validate_inclusion(changeset, field, values) do
    case get_change(changeset, field) do
      nil -> changeset
      "" -> changeset
      _ -> validate_inclusion(changeset, field, values)
    end
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
