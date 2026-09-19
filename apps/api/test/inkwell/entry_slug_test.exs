defmodule Inkwell.EntrySlugTest do
  @moduledoc """
  Publishing rebuilt the slug from the title alone, so publishing a draft whose
  title the writer had used before crashed with a unique-index error (500).
  Autosave creates a draft first, so this was nearly every editor publish with
  a reused title, plus bulk publish, scheduled posts and imports.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.Journals

  defp draft(user, title) do
    {:ok, e} =
      Journals.create_draft(%{
        "user_id" => user.id,
        "title" => title,
        "body_html" => "<p>Some words for #{title}</p>",
        "privacy" => "private"
      })

    e
  end

  test "publishing drafts with the same title gets distinct slugs" do
    user = create_user()

    {:ok, first} = Journals.publish_draft(draft(user, "Morning Pages"), %{})
    {:ok, second} = Journals.publish_draft(draft(user, "Morning Pages"), %{})
    {:ok, third} = Journals.publish_draft(draft(user, "Morning Pages"), %{})

    assert first.slug == "morning-pages"
    assert second.slug == "morning-pages-2"
    assert third.slug == "morning-pages-3"
  end

  test "different writers can use the same slug" do
    {:ok, a} = Journals.publish_draft(draft(create_user(), "Day 12"), %{})
    {:ok, b} = Journals.publish_draft(draft(create_user(), "Day 12"), %{})
    assert a.slug == "day-12"
    assert b.slug == "day-12"
  end

  test "bulk publishing several same-title drafts succeeds for all of them" do
    user = create_user()
    {:ok, _} = Journals.publish_draft(draft(user, "Notes"), %{})
    ids = for _ <- 1..3, do: draft(user, "Notes").id

    Journals.bulk_publish_drafts(user.id, ids)

    slugs =
      Journals.list_own_entries(user.id, [])
      |> then(fn
        {entries, _} -> entries
        %{entries: entries} -> entries
        entries when is_list(entries) -> entries
      end)
      |> Enum.filter(&(&1.status == :published))
      |> Enum.map(& &1.slug)
      |> Enum.sort()

    assert slugs == ["notes", "notes-2", "notes-3", "notes-4"]
  end
end
