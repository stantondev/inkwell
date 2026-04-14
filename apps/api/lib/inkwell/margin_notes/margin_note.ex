defmodule Inkwell.MarginNotes.MarginNote do
  @moduledoc """
  A reader annotation anchored to a text range in a published entry,
  rendered in the page margin. See CLAUDE.md > "Inline Marginalia".

  The anchor follows the W3C Web Annotation TextQuoteSelector model:
  an exact quote plus ~32 chars of prefix and suffix context so the
  anchor survives minor edits to the entry. The optional
  `text_position_start`/`text_position_end` fields are a fast-path hint
  for O(1) lookups when the entry hasn't been edited.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @max_note_plain_chars 500
  @max_quote_chars 1_500
  @max_context_chars 64
  # ASCII unit separator — used as field delimiter when hashing
  @hash_separator "\x1f"

  schema "margin_notes" do
    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :user, Inkwell.Accounts.User

    field :quote_text, :string
    field :quote_prefix, :string, default: ""
    field :quote_suffix, :string, default: ""
    field :quote_hash, :binary

    field :text_position_start, :integer
    field :text_position_end, :integer

    field :note_html, :string
    field :edited_at, :utc_datetime_usec
    field :orphaned_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec)
  end

  @doc """
  Changeset for creating a margin note. Sanitizes the note HTML,
  enforces length caps on the quote and note, and computes the quote hash.
  """
  def create_changeset(note, attrs) do
    note
    |> cast(attrs, [
      :entry_id,
      :user_id,
      :quote_text,
      :quote_prefix,
      :quote_suffix,
      :text_position_start,
      :text_position_end,
      :note_html
    ])
    |> validate_required([:entry_id, :user_id, :quote_text, :note_html])
    |> sanitize_note_html()
    |> validate_note_plain_length()
    |> validate_length(:quote_text, min: 1, max: @max_quote_chars)
    |> validate_length(:quote_prefix, max: @max_context_chars)
    |> validate_length(:quote_suffix, max: @max_context_chars)
    |> validate_position_range()
    |> compute_quote_hash()
    |> foreign_key_constraint(:entry_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:entry_id, :user_id, :quote_hash],
      name: :margin_notes_entry_id_user_id_quote_hash_index,
      message: "already annotated this passage"
    )
  end

  @doc """
  Changeset for updating a margin note body. Only the note HTML can be edited
  (the anchor is immutable — if the user wants to move the highlight they
  delete and recreate). Sets `edited_at`.
  """
  def edit_changeset(note, attrs) do
    note
    |> cast(attrs, [:note_html])
    |> validate_required([:note_html])
    |> sanitize_note_html()
    |> validate_note_plain_length()
    |> put_change(:edited_at, DateTime.utc_now())
  end

  @doc "Changeset for marking a note as orphaned."
  def orphan_changeset(note) do
    change(note, orphaned_at: DateTime.utc_now())
  end

  # ── private ─────────────────────────────────────────────────────────

  defp sanitize_note_html(changeset) do
    case get_change(changeset, :note_html) do
      nil ->
        changeset

      html ->
        put_change(changeset, :note_html, Inkwell.HtmlSanitizer.sanitize(html))
    end
  end

  defp validate_note_plain_length(changeset) do
    case get_field(changeset, :note_html) do
      nil ->
        changeset

      html ->
        plain = strip_html(html)

        if String.length(plain) > @max_note_plain_chars do
          add_error(changeset, :note_html, "must be at most #{@max_note_plain_chars} characters")
        else
          if String.trim(plain) == "" do
            add_error(changeset, :note_html, "cannot be empty")
          else
            changeset
          end
        end
    end
  end

  defp validate_position_range(changeset) do
    start_pos = get_field(changeset, :text_position_start)
    end_pos = get_field(changeset, :text_position_end)

    cond do
      is_nil(start_pos) and is_nil(end_pos) -> changeset
      is_nil(start_pos) or is_nil(end_pos) -> changeset
      start_pos < 0 -> add_error(changeset, :text_position_start, "must be non-negative")
      end_pos < start_pos -> add_error(changeset, :text_position_end, "must be >= start")
      true -> changeset
    end
  end

  defp compute_quote_hash(changeset) do
    quote_text = get_field(changeset, :quote_text)
    prefix = get_field(changeset, :quote_prefix) || ""
    suffix = get_field(changeset, :quote_suffix) || ""

    if is_binary(quote_text) do
      payload =
        normalize(prefix) <>
          @hash_separator <>
          normalize(quote_text) <>
          @hash_separator <>
          normalize(suffix)

      hash = :crypto.hash(:sha256, payload)
      put_change(changeset, :quote_hash, hash)
    else
      changeset
    end
  end

  @doc "Canonical whitespace normalizer used on both sides of anchor comparisons."
  def normalize(nil), do: ""

  def normalize(s) when is_binary(s) do
    s
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
  end

  defp strip_html(html) when is_binary(html) do
    html
    |> String.replace(~r/<[^>]*>/, " ")
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
  end

  defp strip_html(_), do: ""

  @doc "Maximum plain-text length of a note's HTML body."
  def max_note_plain_chars, do: @max_note_plain_chars

  @doc "Maximum length of the quote_text field."
  def max_quote_chars, do: @max_quote_chars

  @doc "Maximum length of the quote_prefix / quote_suffix context fields."
  def max_context_chars, do: @max_context_chars
end
