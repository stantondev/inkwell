defmodule Inkwell.Journals.Entry do
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query, only: [from: 2, where: 3]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "entries" do
    field :title, :string
    field :body_html, :string
    field :body_raw, :map
    field :mood, :string
    field :music, :string
    field :music_metadata, :map
    field :privacy, Ecto.Enum, values: [:public, :friends_only, :private, :custom, :paid]
    field :slug, :string
    field :tags, {:array, :string}, default: []
    field :published_at, :utc_datetime_usec
    # Set on a draft that should publish itself at this time.
    field :scheduled_at, :utc_datetime_usec
    field :scheduled_options, :map, default: %{}
    field :ap_id, :string
    # :hidden = removed from public view by moderation (restorable). Every public
    # query filters on status == :published, so hidden entries drop out everywhere.
    field :status, Ecto.Enum, values: [:draft, :published, :hidden], default: :published
    field :word_count, :integer, default: 0
    field :excerpt, :string
    # true when the writer wrote the excerpt; false means it's generated from
    # the body and regenerated whenever the body changes.
    field :excerpt_custom, :boolean, default: false
    field :cover_image_id, :binary_id
    field :category, Ecto.Enum, values: [
      :personal, :creative_writing, :poetry, :fiction, :travel, :tech,
      :music, :film_tv, :food, :health, :career, :education,
      :relationships, :parenting, :finance, :news_politics,
      :philosophy, :spirituality, :humor, :books, :other
    ]

    # Newsletter
    field :newsletter_sent_at, :utc_datetime_usec
    belongs_to :newsletter_send, Inkwell.Newsletter.Send

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :custom_filter, Inkwell.Social.FriendFilter
    belongs_to :user_icon, Inkwell.Accounts.UserIcon
    belongs_to :series, Inkwell.Journals.Series
    field :series_order, :integer
    has_many :comments, Inkwell.Journals.Comment

    # Discovery
    field :ink_count, :integer, default: 0
    field :reprint_count, :integer, default: 0
    field :margin_note_count, :integer, default: 0

    # Content moderation
    field :sensitive, :boolean, default: false
    field :content_warning, :string
    field :admin_sensitive, :boolean, default: false

    # Source tracking (nil = web, "email" = post by email)
    field :source, :string

    # Quote reprint (references the original entry being reprinted)
    belongs_to :quoted_entry, Inkwell.Journals.Entry
    belongs_to :quoted_remote_entry, Inkwell.Federation.RemoteEntry

    # Cross-posting
    field :crosspost_results, :map, default: %{}

    # "entry" (a journal entry) or "sticky" (a short post: no title, up to
    # @sticky_max_chars characters, federated as a Note instead of an Article).
    field :kind, :string, default: "entry"
    field :sticky_color, :string
    # An entry written by expanding a sticky points back at it.
    belongs_to :source_sticky, Inkwell.Journals.Entry

    timestamps(type: :utc_datetime_usec)
  end

  @sticky_max_chars 500
  @sticky_colors ~w(yellow pink blue green lilac peach)

  def sticky_max_chars, do: @sticky_max_chars
  def sticky_colors, do: @sticky_colors

  @doc "Plain text of an entry body (tags stripped, entities decoded, whitespace collapsed)."
  def plain_text(nil), do: ""

  def plain_text(html) when is_binary(html) do
    html
    |> String.replace(~r/<br\s*\/?>|<\/p>/i, " ")
    |> String.replace(~r/<[^>]*>/, "")
    |> String.replace(~r/&nbsp;/, " ")
    |> String.replace(~r/&amp;/, "&")
    |> String.replace(~r/&lt;/, "<")
    |> String.replace(~r/&gt;/, ">")
    |> String.replace(~r/&quot;|&#39;|&#x27;/, "'")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  # A sticky has no title, a short plain body, and one of the paper colors.
  # Things only journal entries have (series, category, cover, drafts) are
  # left off by StickyController; this is the backstop.
  defp validate_sticky(changeset) do
    case get_field(changeset, :kind) do
      "sticky" ->
        text = plain_text(get_field(changeset, :body_html))

        changeset
        |> then(fn cs ->
          cond do
            text == "" -> add_error(cs, :body_html, "can't be empty")
            String.length(text) > @sticky_max_chars ->
              add_error(cs, :body_html, "should be at most #{@sticky_max_chars} characters")
            true -> cs
          end
        end)
        |> validate_inclusion(:sticky_color, @sticky_colors)
        |> put_change(:title, nil)

      "entry" ->
        changeset

      _ ->
        add_error(changeset, :kind, "is invalid")
    end
  end

  @doc "Changeset for creating/updating published entries."
  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :slug, :tags, :published_at, :user_id, :custom_filter_id,
      :user_icon_id, :status, :word_count, :excerpt, :excerpt_custom, :cover_image_id, :category,
      :series_id, :series_order, :sensitive, :content_warning, :source,
      :quoted_entry_id, :quoted_remote_entry_id,
      :kind, :sticky_color, :source_sticky_id
    ])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:body_html, :privacy, :user_id])
    |> validate_sticky()
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> validate_length(:excerpt, max: 300)
    |> validate_length(:content_warning, max: 200)
    |> validate_inclusion(:privacy, [:public, :friends_only, :private, :custom, :paid])
    |> validate_edited_date_not_future(entry)
    |> generate_slug()
    |> ensure_unique_slug()
    |> unique_constraint([:user_id, :slug], name: :entries_user_id_slug_index)
    |> generate_ap_id()
    |> set_published_at()
  end

  # Writers can change a published entry's date from the editor. Only edits are
  # checked: imports create entries through this changeset too, and a WordPress
  # export can hold a post scheduled for later.
  defp validate_edited_date_not_future(changeset, %__MODULE__{id: id}) when not is_nil(id),
    do: validate_not_future(changeset, :published_at)

  defp validate_edited_date_not_future(changeset, _entry), do: changeset

  @doc "Changeset for creating/updating drafts — relaxed validation."
  def draft_changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :tags, :user_id, :custom_filter_id, :user_icon_id,
      :word_count, :excerpt, :excerpt_custom, :cover_image_id, :category,
      :series_id, :series_order, :sensitive, :content_warning,
      # Imports carry the post's original date. This wasn't cast, so the date
      # was silently dropped the moment an imported post landed in drafts —
      # and publishing then stamped it with today. A WordPress migration of 226
      # posts came out dated as if all written on the same day.
      :published_at,
      :scheduled_at, :scheduled_options,
      :source_sticky_id
    ])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:user_id])
    |> validate_not_future(:published_at)
    |> validate_schedule()
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> validate_length(:excerpt, max: 300)
    |> validate_length(:content_warning, max: 200)
    |> put_change(:status, :draft)
  end

  @doc "Changeset for publishing a draft — generates slug, ap_id, published_at."
  def publish_changeset(entry, attrs) do
    entry
    |> cast(attrs, [
      :title, :body_html, :body_raw, :mood, :music, :music_metadata,
      :privacy, :tags, :custom_filter_id, :user_icon_id,
      :word_count, :excerpt, :excerpt_custom, :cover_image_id, :category,
      :series_id, :series_order, :sensitive, :content_warning,
      :published_at
    ])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:body_html, :privacy])
    |> validate_not_future(:published_at)
    |> validate_length(:title, max: 500)
    |> validate_length(:mood, max: 100)
    |> validate_length(:music, max: 500)
    |> validate_length(:excerpt, max: 300)
    |> validate_length(:content_warning, max: 200)
    |> validate_inclusion(:privacy, [:public, :friends_only, :private, :custom, :paid])
    |> put_change(:status, :published)
    |> put_change(:scheduled_at, nil)
    |> put_change(:scheduled_options, %{})
    |> force_generate_slug()
    |> ensure_unique_slug()
    |> unique_constraint([:user_id, :slug], name: :entries_user_id_slug_index)
    |> generate_ap_id()
    |> put_published_at()
  end

  # Publishing used to unconditionally stamp `DateTime.utc_now()`, so a draft
  # imported with its original date — or one the author had backdated — always
  # came out dated today. Honour an explicit or already-present date, and only
  # fall back to "now" when there genuinely isn't one.
  defp put_published_at(changeset) do
    case get_field(changeset, :published_at) do
      nil -> put_change(changeset, :published_at, DateTime.utc_now())
      _ -> changeset
    end
  end

  # A new or changed schedule has to be in the future, and there has to be
  # something to publish then. (An unchanged schedule isn't rechecked, so
  # autosaving a scheduled draft in its last minute still works.)
  defp validate_schedule(changeset) do
    case get_change(changeset, :scheduled_at) do
      nil ->
        changeset

      at ->
        changeset =
          if DateTime.compare(at, DateTime.utc_now()) == :gt,
            do: changeset,
            else: add_error(changeset, :scheduled_at, "must be in the future")

        if blank_html?(get_field(changeset, :body_html)),
          do: add_error(changeset, :body_html, "can't be empty on a scheduled post"),
          else: changeset
    end
  end

  defp blank_html?(nil), do: true
  defp blank_html?(html), do: html |> String.replace(~r/<[^>]*>|&nbsp;/, "") |> String.trim() == ""

  # Backdating a published date is supported; a future published date is not
  # (scheduling uses `scheduled_at` on a draft instead). A future date would simply make
  # the entry live immediately while displaying a date that hasn't happened, so
  # reject it rather than silently behave like a scheduler. Small tolerance
  # absorbs clock skew between the client and server.
  defp validate_not_future(changeset, field) do
    validate_change(changeset, field, fn ^field, value ->
      cond do
        is_nil(value) ->
          []

        DateTime.compare(value, DateTime.add(DateTime.utc_now(), 300, :second)) == :gt ->
          [{field, "cannot be in the future"}]

        true ->
          []
      end
    end)
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

  # Publishing rebuilt the slug from the title alone, so a second entry with a
  # title the writer had used before ("Morning pages", "Day 12") hit the unique
  # (user_id, slug) index and the publish crashed with a 500. That also broke
  # bulk publish, scheduled posts (silently unscheduled) and imports. Pick the
  # first free variant instead: title, title-2, title-3, ...
  defp ensure_unique_slug(%Ecto.Changeset{valid?: false} = changeset), do: changeset

  defp ensure_unique_slug(changeset) do
    with slug when is_binary(slug) <- get_change(changeset, :slug),
         user_id when not is_nil(user_id) <- get_field(changeset, :user_id) do
      put_change(changeset, :slug, free_slug(slug, user_id, get_field(changeset, :id)))
    else
      _ -> changeset
    end
  end

  defp free_slug(base, user_id, own_id) do
    taken =
      from(e in __MODULE__,
        where: e.user_id == ^user_id and (e.slug == ^base or like(e.slug, ^"#{base}-%")),
        select: e.slug
      )
      |> then(fn q -> if own_id, do: where(q, [e], e.id != ^own_id), else: q end)
      |> Inkwell.Repo.all()
      |> MapSet.new()

    if MapSet.member?(taken, base) do
      Stream.iterate(2, &(&1 + 1))
      |> Stream.map(&"#{base}-#{&1}")
      |> Enum.find(&(not MapSet.member?(taken, &1)))
    else
      base
    end
  end

  defp generate_ap_id(changeset) do
    if get_field(changeset, :ap_id) == nil do
      # Pre-generate the entry ID if not set, so the AP ID uses the real entry ID
      changeset =
        if get_field(changeset, :id) == nil do
          put_change(changeset, :id, Ecto.UUID.generate())
        else
          changeset
        end

      entry_id = get_field(changeset, :id)
      put_change(changeset, :ap_id, "https://inkwell.social/entries/#{entry_id}")
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
