defmodule Inkwell.Journals.Entry do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "entries" do
    field :title, :string
    field :body_html, :string
    field :body_raw, :map
    field :mood, :string
    field :music, :string
    field :music_metadata, :map
    field :privacy, Ecto.Enum, values: [:public, :friends_only, :private, :custom]
    field :slug, :string
    field :tags, {:array, :string}, default: []
    field :published_at, :utc_datetime_usec
    field :ap_id, :string
    field :status, Ecto.Enum, values: [:draft, :published], default: :published

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :custom_filter, Inkwell.Social.FriendFilter
    belongs_to :user_icon, Inkwell.Accounts.UserIcon
    has_many :comments, Inkwell.Journals.Comment

    timestamps(type: :utc_datetime_usec)
  end

  @doc "Changeset for creating/updating published entries."
  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :slug, :tags, :published_at, :user_id, :custom_filter_id,
      :user_icon_id, :status
    ])
    |> validate_required([:body_html, :privacy, :user_id])
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> validate_inclusion(:privacy, [:public, :friends_only, :private, :custom])
    |> generate_slug()
    |> generate_ap_id()
    |> set_published_at()
  end

  @doc "Changeset for creating/updating drafts — relaxed validation."
  def draft_changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :tags, :user_id, :custom_filter_id, :user_icon_id
    ])
    |> validate_required([:user_id])
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> put_change(:status, :draft)
  end

  @doc "Changeset for publishing a draft — generates slug, ap_id, published_at."
  def publish_changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :tags, :custom_filter_id, :user_icon_id
    ])
    |> validate_required([:body_html, :privacy])
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> validate_inclusion(:privacy, [:public, :friends_only, :private, :custom])
    |> put_change(:status, :published)
    |> force_generate_slug()
    |> generate_ap_id()
    |> put_change(:published_at, DateTime.utc_now())
  end

  defp generate_slug(changeset) do
    case {get_field(changeset, :slug), get_change(changeset, :title)} do
      {nil, nil} ->
        put_change(changeset, :slug, Ecto.UUID.generate() |> String.slice(0..7))

      {nil, title} when is_binary(title) ->
        slug =
          title
          |> String.downcase()
          |> String.replace(~r/[^a-z0-9\s-]/, "")
          |> String.replace(~r/\s+/, "-")
          |> String.slice(0..80)
          |> String.trim("-")

        slug = if slug == "", do: Ecto.UUID.generate() |> String.slice(0..7), else: slug
        put_change(changeset, :slug, slug)

      _ ->
        changeset
    end
  end

  # Always generate a slug when publishing (draft -> published)
  defp force_generate_slug(changeset) do
    title = get_field(changeset, :title)

    if is_binary(title) && title != "" do
      slug =
        title
        |> String.downcase()
        |> String.replace(~r/[^a-z0-9\s-]/, "")
        |> String.replace(~r/\s+/, "-")
        |> String.slice(0..80)
        |> String.trim("-")

      slug = if slug == "", do: Ecto.UUID.generate() |> String.slice(0..7), else: slug
      put_change(changeset, :slug, slug)
    else
      put_change(changeset, :slug, Ecto.UUID.generate() |> String.slice(0..7))
    end
  end

  defp generate_ap_id(changeset) do
    if get_field(changeset, :ap_id) == nil do
      id = Ecto.UUID.generate()
      put_change(changeset, :ap_id, "https://inkwell.social/entries/#{id}")
    else
      changeset
    end
  end

  defp set_published_at(changeset) do
    if get_field(changeset, :published_at) == nil do
      put_change(changeset, :published_at, DateTime.utc_now())
    else
      changeset
    end
  end
end
