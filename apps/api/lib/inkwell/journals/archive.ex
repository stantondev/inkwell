defmodule Inkwell.Journals.Archive do
  @moduledoc """
  The archive mark on imported posts: a postmark naming where the post first
  lived (LiveJournal, Dreamwidth, …) and a cover letter clipped to the top of
  it, so readers can tell a post written in 2004 from one written this week.

  Imports record `imported_from` on every post; the writer decides whether it
  shows (`archive_mark`), for everything at once here or post by post from
  the Posts page. The cover letter can carry a short note in the writer's own
  words, kept in `users.settings["archive_note"]`.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Journals.Entry
  alias Inkwell.Accounts.User

  @note_max 600

  def note_max, do: @note_max

  @doc "What the writer has imported, by origin, and how much of it is marked."
  def summary(%User{} = user) do
    origins =
      from(e in Entry,
        where: e.user_id == ^user.id and not is_nil(e.imported_from),
        group_by: e.imported_from,
        select: %{
          origin: e.imported_from,
          count: count(e.id),
          marked: fragment("count(*) FILTER (WHERE ?)", e.archive_mark),
          earliest: min(e.published_at),
          latest: max(e.published_at)
        },
        order_by: [desc: count(e.id)]
      )
      |> Repo.all()

    %{origins: origins, note: note(user), note_max: @note_max}
  end

  def note(%User{settings: %{"archive_note" => note}}) when is_binary(note), do: note
  def note(_), do: ""

  @doc """
  Shows or hides the mark on every imported post from `origin` (all origins
  when nil). Returns the number of posts changed.
  """
  def set_mark(user_id, on?, origin \\ nil) when is_boolean(on?) do
    query = from(e in Entry, where: e.user_id == ^user_id and not is_nil(e.imported_from) and e.archive_mark != ^on?)
    query = if origin, do: where(query, [e], e.imported_from == ^origin), else: query
    {count, _} = Repo.update_all(query, set: [archive_mark: on?, updated_at: DateTime.utc_now()])
    count
  end

  @doc """
  Shows or hides the mark on the given posts (the Posts page's bulk tools).
  Posts that weren't imported can't carry it and are left alone.
  """
  def set_mark_for(user_id, entry_ids, on?) when is_list(entry_ids) and is_boolean(on?) do
    owned = from(e in Entry, where: e.id in ^entry_ids and e.user_id == ^user_id) |> Repo.aggregate(:count)

    if owned != length(entry_ids) do
      {:error, :unauthorized}
    else
      {count, _} =
        from(e in Entry, where: e.id in ^entry_ids and e.user_id == ^user_id and not is_nil(e.imported_from))
        |> Repo.update_all(set: [archive_mark: on?, updated_at: DateTime.utc_now()])

      {:ok, count}
    end
  end

  @doc "Saves the cover-letter note (plain text; blank removes it)."
  def set_note(%User{} = user, note) when is_binary(note) do
    note = note |> String.replace("\r\n", "\n") |> String.trim()

    cond do
      String.length(note) > @note_max ->
        {:error, "Keep the note under #{@note_max} characters."}

      true ->
        settings = Map.put(user.settings || %{}, "archive_note", note)
        user |> Ecto.Changeset.change(settings: settings) |> Repo.update()
    end
  end
end
