defmodule Inkwell.Stamps do
  @moduledoc """
  Stamps: postage a reader sends a writer.

  Readers see which designs are on a post and when each was pressed (the
  "marks"); only the writer sees who sent them and the notes ("letters").
  Members send stamps (`user_id`); fediverse accounts' emoji reactions
  arrive as stamps from abroad (`remote_actor_id`).
  """
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Stamps.Stamp
  alias Inkwell.Journals.Entry

  # Marks shown on a post: the newest few.
  @marks_per_entry 6

  # ── Sending ─────────────────────────────────────────────────────────────

  @doc """
  Create or change a member's stamp on an entry.

  `attrs` holds `:stamp_type` and, when the reader sent one, `:note` (a
  missing `:note` key keeps the note already there; nil/"" clears it).

  Returns `{:ok, stamp, :created | :updated, previous_type}`.
  """
  def stamp_entry(user_id, entry_id, attrs) when is_map(attrs) do
    upsert(Repo.get_by(Stamp, user_id: user_id, entry_id: entry_id), %{user_id: user_id, entry_id: entry_id}, attrs)
  end

  @doc "Same, for a fediverse post."
  def stamp_remote_entry(user_id, remote_entry_id, attrs) when is_map(attrs) do
    upsert(
      Repo.get_by(Stamp, user_id: user_id, remote_entry_id: remote_entry_id),
      %{user_id: user_id, remote_entry_id: remote_entry_id},
      attrs
    )
  end

  defp upsert(nil, keys, attrs) do
    %Stamp{}
    |> Stamp.changeset(Map.merge(keys, attrs))
    |> Repo.insert()
    |> case do
      {:ok, stamp} -> {:ok, stamp, :created, nil}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp upsert(existing, _keys, attrs) do
    previous = existing.stamp_type

    existing
    |> Stamp.changeset(attrs)
    |> Repo.update()
    |> case do
      {:ok, stamp} -> {:ok, stamp, :updated, previous}
      {:error, changeset} -> {:error, changeset}
    end
  end

  @doc "Take a member's stamp back. Returns `{:ok, stamp}` or `{:error, :not_found}`."
  def remove_stamp(user_id, entry_id) do
    case Repo.get_by(Stamp, user_id: user_id, entry_id: entry_id) do
      nil -> {:error, :not_found}
      stamp -> Repo.delete(stamp)
    end
  end

  def remove_remote_stamp(user_id, remote_entry_id) do
    case Repo.get_by(Stamp, user_id: user_id, remote_entry_id: remote_entry_id) do
      nil -> {:error, :not_found}
      stamp -> Repo.delete(stamp)
    end
  end

  # ── Stamps from the fediverse ───────────────────────────────────────────

  @doc """
  Record an emoji reaction from a fediverse account on a member's entry.
  One per account per entry: a new reaction replaces the old one.
  Returns `{:ok, :created | :updated, stamp}`, `{:ok, :existing}` for a
  redelivery, or `{:error, changeset}`.
  """
  def receive_remote_stamp(remote_actor_id, entry_id, attrs) do
    ap_id = attrs[:ap_id]

    cond do
      is_binary(ap_id) and Repo.exists?(from(s in Stamp, where: s.ap_id == ^ap_id)) ->
        {:ok, :existing}

      true ->
        existing = Repo.get_by(Stamp, remote_actor_id: remote_actor_id, entry_id: entry_id)
        attrs = Map.merge(attrs, %{remote_actor_id: remote_actor_id, entry_id: entry_id})

        result =
          case existing do
            nil -> %Stamp{} |> Stamp.changeset(attrs) |> Repo.insert()
            stamp -> stamp |> Stamp.changeset(attrs) |> Repo.update()
          end

        case result do
          {:ok, stamp} -> {:ok, if(existing, do: :updated, else: :created), stamp}
          # Two deliveries of the same reaction racing each other.
          {:error, %Ecto.Changeset{errors: errors} = cs} ->
            if Keyword.has_key?(errors, :ap_id), do: {:ok, :existing}, else: {:error, cs}
        end
    end
  end

  @doc "Undo of a fediverse reaction: by its activity id, else by account + entry."
  def remove_remote_actor_stamp(remote_actor_id, entry_id, ap_id \\ nil) do
    by_ap =
      if is_binary(ap_id),
        do: from(s in Stamp, where: s.ap_id == ^ap_id and s.remote_actor_id == ^remote_actor_id),
        else: nil

    {count, _} =
      case by_ap && Repo.delete_all(by_ap) do
        {n, _} = r when n > 0 -> r
        _ when is_binary(entry_id) ->
          Repo.delete_all(from(s in Stamp, where: s.remote_actor_id == ^remote_actor_id and s.entry_id == ^entry_id))
        _ -> {0, nil}
      end

    count
  end

  # ── What readers see ────────────────────────────────────────────────────

  @doc """
  For a list of entry ids: `%{entry_id => %{types, marks, count}}`.
  `types` are the distinct designs present, `marks` the newest few stamps
  (no senders), `count` all of them. Entries with no stamps are absent.
  """
  def summaries(entry_ids), do: summaries(:entry_id, entry_ids)
  def remote_summaries(remote_entry_ids), do: summaries(:remote_entry_id, remote_entry_ids)

  defp summaries(_field, []), do: %{}

  defp summaries(field, ids) when is_list(ids) do
    ranked =
      from(s in Stamp,
        where: field(s, ^field) in ^ids,
        left_join: a in assoc(s, :remote_actor),
        select: %{
          target: field(s, ^field),
          id: s.id,
          type: s.stamp_type,
          inserted_at: s.inserted_at,
          emoji: s.emoji,
          emoji_url: s.emoji_url,
          domain: a.domain,
          rank: over(row_number(), :w),
          total: over(count(s.id), :t)
        },
        windows: [
          w: [partition_by: field(s, ^field), order_by: [desc: s.inserted_at]],
          t: [partition_by: field(s, ^field)]
        ]
      )

    rows = Repo.all(from(r in subquery(ranked), order_by: [asc: r.rank]))

    types =
      from(s in Stamp, where: field(s, ^field) in ^ids, select: {field(s, ^field), s.stamp_type}, distinct: true)
      |> Repo.all()
      |> Enum.group_by(&elem(&1, 0), &Atom.to_string(elem(&1, 1)))

    rows
    |> Enum.group_by(& &1.target)
    |> Map.new(fn {target, list} ->
      marks = list |> Enum.filter(&(&1.rank <= @marks_per_entry)) |> Enum.map(&mark/1)
      {target, %{types: Map.get(types, target, []), marks: marks, count: hd(list).total}}
    end)
  end

  @doc "Accessors for a `summaries/1` map, with empty defaults."
  def types(summaries, id), do: get_in(summaries, [id, :types]) || []
  def marks(summaries, id), do: get_in(summaries, [id, :marks]) || []
  def count(summaries, id), do: get_in(summaries, [id, :count]) || 0

  @doc "The three stamp fields an entry response carries."
  def fields(summaries, id) do
    %{stamps: types(summaries, id), stamp_marks: marks(summaries, id), stamp_count: count(summaries, id)}
  end

  def entry_fields(entry_id), do: fields(summaries([entry_id]), entry_id)
  def remote_entry_fields(remote_entry_id), do: fields(remote_summaries([remote_entry_id]), remote_entry_id)

  @doc "A stamp as readers see it: design and date, no sender."
  def mark(%Stamp{} = s) do
    domain = if Ecto.assoc_loaded?(s.remote_actor) && s.remote_actor, do: s.remote_actor.domain

    mark(%{id: s.id, type: s.stamp_type, inserted_at: s.inserted_at, emoji: s.emoji, emoji_url: s.emoji_url, domain: domain})
  end

  def mark(%{} = row) do
    %{
      id: row.id,
      type: to_string(row.type),
      stamped_on: row.inserted_at |> DateTime.to_date() |> Date.to_iso8601(),
      emoji: Inkwell.Federation.StampReactions.drawable_emoji(row.emoji),
      emoji_url: row.emoji_url,
      domain: row.domain
    }
  end

  # Kept for callers that only need the designs.
  def get_stamp_types_for_entries(entry_ids), do: Map.new(summaries(entry_ids), fn {k, v} -> {k, v.types} end)
  def get_stamp_types_for_remote_entries(ids), do: Map.new(remote_summaries(ids), fn {k, v} -> {k, v.types} end)
  def get_entry_stamp_types(entry_id), do: entry_fields(entry_id).stamps

  # ── The viewer's own stamp ──────────────────────────────────────────────

  def get_user_stamp(user_id, entry_id) do
    Repo.one(from(s in Stamp, where: s.user_id == ^user_id and s.entry_id == ^entry_id))
  end

  def get_user_remote_stamp(user_id, remote_entry_id) do
    Repo.one(from(s in Stamp, where: s.user_id == ^user_id and s.remote_entry_id == ^remote_entry_id))
  end

  @doc "Map of entry_id => the viewer's stamp type (string)."
  def get_user_stamps_for_entries(_user_id, []), do: %{}

  def get_user_stamps_for_entries(user_id, entry_ids) when is_list(entry_ids) do
    from(s in Stamp, where: s.user_id == ^user_id and s.entry_id in ^entry_ids, select: {s.entry_id, s.stamp_type})
    |> Repo.all()
    |> Map.new(fn {id, t} -> {id, Atom.to_string(t)} end)
  end

  def get_user_stamps_for_remote_entries(_user_id, []), do: %{}

  def get_user_stamps_for_remote_entries(user_id, ids) when is_list(ids) do
    from(s in Stamp, where: s.user_id == ^user_id and s.remote_entry_id in ^ids, select: {s.remote_entry_id, s.stamp_type})
    |> Repo.all()
    |> Map.new(fn {id, t} -> {id, Atom.to_string(t)} end)
  end

  # ── What the writer sees ────────────────────────────────────────────────

  @doc "Every stamp on an entry with its sender and note, newest first (writer only)."
  def letters_for_entry(entry_id) do
    from(s in Stamp,
      where: s.entry_id == ^entry_id,
      order_by: [desc: s.inserted_at],
      preload: [:user, :remote_actor]
    )
    |> Repo.all()
  end

  @doc """
  The stamp album. `box` is `:received` (stamps on the user's entries, from
  people they haven't blocked) or `:sent` (stamps the user sent).
  Options: `page`, `per_page` (≤ 60), `type`, `exclude_user_ids`.
  Returns `{stamps, total, type_counts}`.
  """
  def album(user_id, box, opts \\ []) do
    page = max(opts[:page] || 1, 1)
    per_page = opts[:per_page] |> Kernel.||(30) |> min(60) |> max(1)
    exclude = opts[:exclude_user_ids] || []

    base = album_query(user_id, box, exclude)

    filtered =
      case opts[:type] do
        type when is_binary(type) and type != "" ->
          if type in Enum.map(Stamp.stamp_types(), &Atom.to_string/1),
            do: from(s in base, where: s.stamp_type == ^String.to_existing_atom(type)),
            else: from(s in base, where: false)

        _ ->
          base
      end

    total = Repo.aggregate(filtered, :count, :id)

    type_counts =
      from(s in base, group_by: s.stamp_type, select: {s.stamp_type, count(s.id)})
      |> Repo.all()
      |> Map.new(fn {t, n} -> {Atom.to_string(t), n} end)

    stamps =
      from(s in filtered,
        order_by: [desc: s.inserted_at, desc: s.id],
        limit: ^per_page,
        offset: ^((page - 1) * per_page),
        preload: [:user, :remote_actor, entry: :user, remote_entry: :remote_actor]
      )
      |> Repo.all()

    {stamps, total, type_counts}
  end

  defp album_query(user_id, :received, exclude) do
    from(s in Stamp,
      join: e in Entry,
      on: e.id == s.entry_id,
      where: e.user_id == ^user_id and (is_nil(s.user_id) or s.user_id not in ^exclude)
    )
  end

  defp album_query(user_id, :sent, _exclude) do
    from(s in Stamp, where: s.user_id == ^user_id)
  end
end
