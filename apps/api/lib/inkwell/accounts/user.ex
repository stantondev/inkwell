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
    field :bio_html, :string
    field :pronouns, :string
    field :avatar_url, :string
    field :avatar_config, :map
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
    field :profile_banner_url, :string
    field :profile_status, :string
    field :profile_theme, :string
    field :profile_entry_display, :string, default: "cards"
    field :avatar_frame, :string
    field :ap_id, :string
    field :public_key, :string
    field :private_key, :string
    field :settings, :map, default: %{}

    # Admin
    field :role, :string, default: "user"
    field :blocked_at, :utc_datetime_usec

    # Subscription / billing
    field :stripe_customer_id, :string
    field :stripe_subscription_id, :string
    field :subscription_tier, :string, default: "free"
    field :subscription_status, :string, default: "none"
    field :subscription_expires_at, :utc_datetime_usec

    # Terms acceptance
    field :terms_accepted_at, :utc_datetime_usec

    # Newsletter
    field :newsletter_enabled, :boolean, default: false
    field :newsletter_name, :string
    field :newsletter_description, :string
    field :newsletter_reply_to, :string

    # Writer support
    field :support_url, :string
    field :support_label, :string

    # Stripe Connect (tipping)
    field :stripe_connect_account_id, :string
    field :stripe_connect_enabled, :boolean, default: false
    field :stripe_connect_onboarded, :boolean, default: false

    # Ink Donor (voluntary donation)
    field :ink_donor_stripe_subscription_id, :string
    field :ink_donor_status, :string
    field :ink_donor_amount_cents, :integer

    # Profile improvements
    field :pinned_entry_ids, {:array, :string}, default: []
    field :social_links, :map, default: %{}

    # Profile view counter
    field :visitor_count, :integer, default: 0

    # Language preference (for content translation)
    field :preferred_language, :string

    # Invitations
    field :invite_code, :string
    field :invited_by_id, :binary_id

    has_many :entries, Inkwell.Journals.Entry
    has_many :user_icons, Inkwell.Accounts.UserIcon
    has_many :notifications, Inkwell.Accounts.Notification

    timestamps(type: :utc_datetime_usec)
  end

  # Usernames that could cause brand confusion or conflict with routes
  @reserved_usernames ~w(
    inkwell inkwellsocial inkwell_social admin administrator
    moderator mod support help system root superuser
    api auth login signup register settings notifications
    feed explore search admin inbox outbox users
    newsletter billing noreply postmaster webmaster abuse
  )

  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :email, :display_name])
    |> validate_required([:username, :email])
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]{3,30}$/, message: "must be 3-30 alphanumeric characters or underscores")
    |> validate_not_reserved(:username)
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
    |> validate_not_reserved(:username)
    |> unique_constraint(:username)
    |> generate_ap_id()
  end

  def reserved_username?(username) do
    String.downcase(username) in @reserved_usernames
  end

  defp validate_not_reserved(changeset, field) do
    validate_change(changeset, field, fn _, value ->
      if reserved_username?(value) do
        [{field, "is reserved and cannot be used"}]
      else
        []
      end
    end)
  end

  def subscription_changeset(user, attrs) do
    user
    |> cast(attrs, [:stripe_customer_id, :stripe_subscription_id, :subscription_tier, :subscription_status, :subscription_expires_at])
  end

  def stripe_connect_changeset(user, attrs) do
    user
    |> cast(attrs, [:stripe_connect_account_id, :stripe_connect_enabled, :stripe_connect_onboarded])
  end

  def ink_donor_changeset(user, attrs) do
    user
    |> cast(attrs, [:ink_donor_stripe_subscription_id, :ink_donor_status, :ink_donor_amount_cents])
  end

  @allowed_fonts ~w[default lora courier georgia comic-sans times palatino verdana]
  @allowed_layouts ~w[classic wide minimal magazine]
  @allowed_themes ~w[default manuscript broadsheet midnight-library botanical-press neon-terminal watercolor zine]
  # Legacy theme IDs mapped to new ones for backwards compatibility
  @legacy_theme_map %{
    "cottagecore" => "botanical-press",
    "vaporwave" => "neon-terminal",
    "dark-academia" => "midnight-library",
    "retro-web" => "zine",
    "midnight" => "midnight-library",
    "pastel" => "watercolor",
    "ocean" => "broadsheet"
  }
  @allowed_frames ~w[none classic ink-ring notebook wax-seal gilded constellation botanical neon stamp]
  @allowed_entry_displays ~w[full cards preview]

  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :display_name, :bio, :bio_html, :pronouns, :avatar_url, :avatar_config,
      :profile_html, :profile_css, :settings,
      :profile_music, :profile_background_url, :profile_banner_url, :profile_background_color,
      :profile_accent_color, :profile_foreground_color, :profile_font, :profile_layout,
      :profile_widgets, :profile_status, :profile_theme, :profile_entry_display, :avatar_frame,
      :newsletter_enabled, :newsletter_name, :newsletter_description, :newsletter_reply_to,
      :support_url, :support_label,
      :pinned_entry_ids, :social_links,
      :preferred_language
    ])
    |> validate_length(:bio, max: 2000)
    |> validate_length(:bio_html, max: 10_000)
    |> validate_length(:display_name, max: 100)
    |> validate_length(:profile_status, max: 280)
    |> validate_length(:profile_music, max: 500)
    |> validate_length(:profile_html, max: 50_000)
    |> validate_length(:profile_css, max: 100_000)
    |> validate_length(:newsletter_name, max: 200)
    |> validate_length(:newsletter_description, max: 500)
    |> validate_length(:support_url, max: 500)
    |> validate_length(:support_label, max: 50)
    |> validate_pinned_entries()
    |> maybe_validate_format(:support_url, ~r/^https:\/\/.+/, message: "must be a valid HTTPS URL")
    |> maybe_validate_format(:profile_background_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_format(:profile_accent_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_format(:profile_foreground_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a valid hex color")
    |> maybe_validate_inclusion(:profile_font, @allowed_fonts)
    |> maybe_validate_inclusion(:profile_layout, @allowed_layouts)
    |> normalize_theme()
    |> maybe_validate_inclusion(:profile_theme, @allowed_themes)
    |> maybe_validate_inclusion(:avatar_frame, @allowed_frames)
    |> maybe_validate_inclusion(:profile_entry_display, @allowed_entry_displays)
    |> validate_avatar_config()
  end

  defp validate_avatar_config(changeset) do
    case get_change(changeset, :avatar_config) do
      nil -> changeset
      %{"style" => style, "options" => options} when is_binary(style) and is_map(options) -> changeset
      _ -> add_error(changeset, :avatar_config, "must have style and options keys")
    end
  end

  # Transparently migrate old theme IDs to new ones on save
  defp normalize_theme(changeset) do
    case get_change(changeset, :profile_theme) do
      nil -> changeset
      theme -> put_change(changeset, :profile_theme, Map.get(@legacy_theme_map, theme, theme))
    end
  end

  # Only validate format/inclusion when the field is actually being changed (not nil)
  defp maybe_validate_format(changeset, field, format, opts) do
    case get_change(changeset, field) do
      nil -> changeset
      "" -> changeset
      _ -> validate_format(changeset, field, format, opts)
    end
  end

  defp validate_pinned_entries(changeset) do
    case get_change(changeset, :pinned_entry_ids) do
      nil -> changeset
      ids when is_list(ids) and length(ids) <= 3 -> changeset
      ids when is_list(ids) -> add_error(changeset, :pinned_entry_ids, "cannot pin more than 3 entries")
      _ -> changeset
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
