defmodule Inkwell.MarginNotes do
  @moduledoc """
  Context for inline marginalia — reader annotations anchored to text
  ranges in a published entry. See CLAUDE.md > "Inline Marginalia".

  Mirrors the Inks/Stamps/Reprints pattern: per-user-per-passage storage,
  denormalized counter on entries, atomic counter updates via
  `Ecto.Multi`, block cascade handled via `cascade_delete_for_block/2`.
  """

  import Ecto.Query
  alias Ecto.Multi
  alias Inkwell.Repo
  alias Inkwell.MarginNotes.MarginNote
  alias Inkwell.Journals.Entry

  @edit_window_seconds 24 * 60 * 60
  @per_entry_per_user_limit 20

  # ── Read ────────────────────────────────────────────────────────────

  @doc """
  List margin notes on an entry, ordered by their text position (or
  creation order as a fallback). Preloads the note author. Excludes
  orphaned notes by default — pass `orphaned: true` to include them
  instead, or `orphaned: :both` for all notes.
  """
  def list_for_entry(entry_id, opts \\ []) do
    orphan_mode = Keyword.get(opts, :orphaned, false)
    exclude_user_ids = Keyword.get(opts, :exclude_user_ids, [])

    query =
      MarginNote
      |> where([mn], mn.entry_id == ^entry_id)
      |> order_by([mn], asc_nulls_last: mn.text_position_start, asc: mn.inserted_at)
      |> preload(user: [])

    query =
      case orphan_mode do
        false -> where(query, [mn], is_nil(mn.orphaned_at))
        true -> where(query, [mn], not is_nil(mn.orphaned_at))
        :both -> query
      end

    query =
      if exclude_user_ids == [] do
        query
      else
        where(query, [mn], mn.user_id not in ^exclude_user_ids)
      end

    Repo.all(query)
  end

  @doc "Returns just the count of non-orphaned margin notes on an entry."
  def count_for_entry(entry_id) do
    MarginNote
    |> where([mn], mn.entry_id == ^entry_id and is_nil(mn.orphaned_at))
    |> Repo.aggregate(:count, :id)
  end

  @doc """
  Batch query for feed/explore: returns a map of `entry_id => count`.
  We don't return full note bodies here to keep the payload small —
  the detail page does a dedicated fetch.
  """
  def count_for_entries(entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      %{}
    else
      MarginNote
      |> where([mn], mn.entry_id in ^entry_ids and is_nil(mn.orphaned_at))
      |> group_by([mn], mn.entry_id)
      |> select([mn], {mn.entry_id, count(mn.id)})
      |> Repo.all()
      |> Map.new()
    end
  end

  @doc "Get a single note by ID, or nil."
  def get_note(id) do
    MarginNote
    |> preload(user: [])
    |> Repo.get(id)
  end

  @doc "Count how many notes a specific user has on a specific entry."
  def count_by_user_for_entry(user_id, entry_id) do
    MarginNote
    |> where([mn], mn.user_id == ^user_id and mn.entry_id == ^entry_id)
    |> Repo.aggregate(:count, :id)
  end

  @doc "Per-user-per-entry note cap. Used by controller for a friendly error."
  def per_user_per_entry_limit, do: @per_entry_per_user_limit

  # ── Write ───────────────────────────────────────────────────────────

  @doc """
  Create a margin note and atomically increment the entry's
  `margin_note_count`. Returns `{:ok, note}` or `{:error, changeset}`.

  Duplicate anchors by the same user on the same entry are rejected by
  the unique constraint and surface as a changeset error.
  """
  def create_note(attrs) do
    changeset = MarginNote.create_changeset(%MarginNote{}, attrs)

    multi =
      Multi.new()
      |> Multi.insert(:note, changeset)
      |> Multi.update_all(
        :bump_count,
        fn %{note: note} ->
          from(e in Entry, where: e.id == ^note.entry_id)
        end,
        inc: [margin_note_count: 1]
      )

    case Repo.transaction(multi) do
      {:ok, %{note: note}} ->
        {:ok, Repo.preload(note, user: [])}

      {:error, :note, changeset, _} ->
        {:error, changeset}
    end
  end

  @doc """
  Update a margin note's body. Enforces a 24-hour edit window.
  Returns `{:ok, note}`, `{:error, :expired}`, or `{:error, changeset}`.
  """
  def update_note(%MarginNote{} = note, attrs) do
    if within_edit_window?(note) do
      note
      |> MarginNote.edit_changeset(attrs)
      |> Repo.update()
      |> case do
        {:ok, updated} -> {:ok, Repo.preload(updated, user: [])}
        error -> error
      end
    else
      {:error, :expired}
    end
  end

  defp within_edit_window?(%MarginNote{inserted_at: ts}) do
    DateTime.diff(DateTime.utc_now(), ts) < @edit_window_seconds
  end

  @doc """
  Delete a margin note and atomically decrement the entry's counter.
  Skip the decrement if the note was orphaned (it was already not
  contributing to the visible count).
  """
  def delete_note(%MarginNote{} = note) do
    multi =
      Multi.new()
      |> Multi.delete(:note, note)

    multi =
      if is_nil(note.orphaned_at) do
        Multi.update_all(
          multi,
          :decrement_count,
          from(e in Entry, where: e.id == ^note.entry_id),
          inc: [margin_note_count: -1]
        )
      else
        multi
      end

    case Repo.transaction(multi) do
      {:ok, _} -> {:ok, note}
      {:error, _, reason, _} -> {:error, reason}
    end
  end

  @doc """
  Mark a note as orphaned (its anchor no longer resolves against the
  current entry body). Decrements the visible counter exactly once —
  calling this on a note that's already orphaned is a no-op.
  """
  def mark_orphaned(%MarginNote{orphaned_at: nil} = note) do
    multi =
      Multi.new()
      |> Multi.update(:note, MarginNote.orphan_changeset(note))
      |> Multi.update_all(
        :decrement_count,
        from(e in Entry, where: e.id == ^note.entry_id),
        inc: [margin_note_count: -1]
      )

    case Repo.transaction(multi) do
      {:ok, %{note: updated}} -> {:ok, updated}
      {:error, _, reason, _} -> {:error, reason}
    end
  end

  def mark_orphaned(%MarginNote{} = note), do: {:ok, note}

  # ── Block cascade ───────────────────────────────────────────────────

  @doc """
  Called from `Social.block/2`. Deletes every margin note written by
  `blocker_id` on `blocked_id`'s entries and vice versa, and
  decrements the counters on the affected entries.
  """
  def cascade_delete_for_block(blocker_id, blocked_id) do
    entry_ids_by_blocker =
      from(e in Entry, where: e.user_id == ^blocker_id, select: e.id)

    entry_ids_by_blocked =
      from(e in Entry, where: e.user_id == ^blocked_id, select: e.id)

    delete_and_decrement(blocker_id, entry_ids_by_blocked)
    delete_and_decrement(blocked_id, entry_ids_by_blocker)
    :ok
  end

  defp delete_and_decrement(author_id, entry_ids_query) do
    # Count how many non-orphaned notes each entry will lose so we can
    # decrement the denormalized counter in lockstep with the delete.
    affected =
      MarginNote
      |> where(
        [mn],
        mn.user_id == ^author_id and
          mn.entry_id in subquery(entry_ids_query) and
          is_nil(mn.orphaned_at)
      )
      |> group_by([mn], mn.entry_id)
      |> select([mn], {mn.entry_id, count(mn.id)})
      |> Repo.all()

    MarginNote
    |> where(
      [mn],
      mn.user_id == ^author_id and mn.entry_id in subquery(entry_ids_query)
    )
    |> Repo.delete_all()

    Enum.each(affected, fn {entry_id, n} ->
      Entry
      |> where(id: ^entry_id)
      |> Repo.update_all(inc: [margin_note_count: -n])
    end)
  end
end
