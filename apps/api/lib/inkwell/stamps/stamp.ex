defmodule Inkwell.Stamps.Stamp do
  @moduledoc """
  A stamp: postage a reader sends a writer. One per sender per entry; the
  sender can change the design or the note, or take it back.

  Sent by a member (`user_id`) or, for fediverse emoji reactions, by a
  remote account (`remote_actor_id`, with its `emoji`/`emoji_url` and the
  activity's `ap_id`). The note is private to the writer.

  The designs must match `STAMP_CONFIG` in apps/web/src/components/stamp-config.ts.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # Free for everyone, always offered.
  @everyday [:felt, :rooting, :beautifully_said, :holding_space, :thank_you, :made_me_laugh, :first_class]
  # Dated commemorative issues: free, never withdrawn.
  @issues [:autumn_2026]
  # The Plus members' sheet.
  @keepsakes [:wax_seal, :gilded, :pressed_flower]
  # No longer offered; stamps already given still show.
  @retired [:throwback, :i_cannot]
  # A fediverse account's own emoji, in our frame.
  @abroad [:abroad]

  @stamp_types @everyday ++ @issues ++ @keepsakes ++ @retired ++ @abroad

  @note_max 140

  schema "stamps" do
    field :stamp_type, Ecto.Enum, values: @stamp_types
    field :note, :string
    field :emoji, :string
    field :emoji_url, :string
    field :ap_id, :string

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :remote_entry, Inkwell.Federation.RemoteEntry
    belongs_to :user, Inkwell.Accounts.User
    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema

    timestamps(type: :utc_datetime_usec)
  end

  def stamp_types, do: @stamp_types
  def note_max, do: @note_max

  @doc "Designs a member can choose today (strings)."
  def pickable, do: Enum.map(@everyday ++ @issues ++ @keepsakes, &Atom.to_string/1)
  def keepsakes, do: Enum.map(@keepsakes, &Atom.to_string/1)
  def retired, do: Enum.map(@retired, &Atom.to_string/1)

  def changeset(stamp, attrs) do
    stamp
    |> cast(attrs, [:stamp_type, :entry_id, :remote_entry_id, :user_id, :remote_actor_id, :note, :emoji, :emoji_url, :ap_id])
    |> update_change(:note, &clean_note/1)
    |> validate_required([:stamp_type])
    |> validate_length(:note, max: @note_max)
    |> validate_length(:emoji, max: 120)
    |> validate_length(:emoji_url, max: 2000)
    |> validate_sender()
    |> validate_entry_target()
    |> unique_constraint([:user_id, :entry_id])
    |> unique_constraint([:user_id, :remote_entry_id], name: :stamps_user_id_remote_entry_id_index)
    |> unique_constraint([:remote_actor_id, :entry_id], name: :stamps_remote_actor_id_entry_id_index)
    |> unique_constraint(:ap_id, name: :stamps_ap_id_index)
    |> check_constraint(:user_id, name: :stamps_one_sender)
  end

  @doc """
  Plain text, one line, trimmed; blank becomes nil. Control characters go.
  """
  def clean_note(nil), do: nil

  def clean_note(note) when is_binary(note) do
    note
    |> String.replace(~r/[\x00-\x09\x0B-\x1F\x7F]/u, "")
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
    |> case do
      "" -> nil
      s -> s
    end
  end

  def clean_note(_), do: nil

  defp validate_sender(changeset) do
    user_id = get_field(changeset, :user_id)
    remote_actor_id = get_field(changeset, :remote_actor_id)

    cond do
      is_nil(user_id) and is_nil(remote_actor_id) ->
        add_error(changeset, :user_id, "a stamp needs a sender")

      not is_nil(user_id) and not is_nil(remote_actor_id) ->
        add_error(changeset, :user_id, "a stamp has one sender")

      true ->
        changeset
    end
  end

  defp validate_entry_target(changeset) do
    entry_id = get_field(changeset, :entry_id)
    remote_entry_id = get_field(changeset, :remote_entry_id)

    cond do
      is_nil(entry_id) and is_nil(remote_entry_id) ->
        add_error(changeset, :entry_id, "either entry_id or remote_entry_id must be present")

      not is_nil(entry_id) and not is_nil(remote_entry_id) ->
        add_error(changeset, :entry_id, "cannot set both entry_id and remote_entry_id")

      true ->
        changeset
    end
  end
end
