defmodule Inkwell.Journals.ArchiveTest do
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query
  import Inkwell.Factory
  alias Inkwell.{Import, Repo}
  alias Inkwell.Journals.{Archive, Entry}
  alias Inkwell.Workers.ImportDataWorker

  @export """
  <?xml version="1.0" encoding='utf-8'?>
  <livejournal>
  <entry>
  <itemid>154</itemid>
  <eventtime>2004-12-21 20:00:00</eventtime>
  <subject>Semester break</subject>
  <event>Wow, my day was boring.</event>
  <security>public</security>
  </entry>
  <entry>
  <itemid>155</itemid>
  <eventtime>2004-12-23 09:15:00</eventtime>
  <subject>Another</subject>
  <event>More thoughts.</event>
  <security>public</security>
  </entry>
  </livejournal>
  """

  defp run_import(user, options) do
    {:ok, record} =
      Import.create_import(%{
        user_id: user.id,
        format: "livejournal",
        import_mode: "published",
        default_privacy: "public",
        file_data: @export,
        file_name: "export.xml",
        file_size: byte_size(@export),
        status: "pending",
        options: options
      })

    Oban.Testing.with_testing_mode(:manual, fn ->
      perform_job(ImportDataWorker, %{"import_id" => record.id, "user_id" => user.id})
    end)

    Repo.all(from e in Entry, where: e.user_id == ^user.id, order_by: e.published_at)
  end

  test "imports record their origin, and the mark only when asked for" do
    user = create_user()
    [a, b] = run_import(user, %{})
    assert a.imported_from == "livejournal" and b.imported_from == "livejournal"
    refute a.archive_mark

    other = create_user()
    [c, _] = run_import(other, %{"archive_mark" => true})
    assert c.archive_mark
  end

  test "re-running an import fills in the origin on posts imported before we kept it" do
    user = create_user()
    entries = run_import(user, %{"archive_mark" => true})
    Repo.update_all(from(e in Entry, where: e.user_id == ^user.id), set: [imported_from: nil, archive_mark: false])

    run_import(user, %{"archive_mark" => true})
    reloaded = Repo.all(from e in Entry, where: e.user_id == ^user.id)
    assert length(reloaded) == length(entries)
    assert Enum.all?(reloaded, &(&1.imported_from == "livejournal" and &1.archive_mark))
  end

  test "switching the mark on and off for everything, and the note" do
    user = create_user()
    run_import(user, %{})
    assert Archive.set_mark(user.id, true) == 2
    assert Archive.set_mark(user.id, true) == 0
    assert %{origins: [%{origin: "livejournal", count: 2, marked: 2}]} = Archive.summary(user)
    assert Archive.set_mark(user.id, false, "livejournal") == 2

    assert {:ok, user} = Archive.set_note(user, "  I was fifteen. Be kind.  ")
    assert Archive.note(user) == "I was fifteen. Be kind."
    assert {:error, _} = Archive.set_note(user, String.duplicate("a", 601))
  end

  test "bulk tools only mark posts that were imported, and only your own" do
    user = create_user()
    [a, _] = run_import(user, %{})

    {:ok, own} =
      Inkwell.Journals.create_entry(%{"user_id" => user.id, "title" => "New", "body_html" => "<p>hi</p>", "privacy" => "public"})

    assert {:ok, 1} = Archive.set_mark_for(user.id, [a.id, own.id], true)
    refute Repo.get!(Entry, own.id).archive_mark

    stranger = create_user()
    assert {:error, :unauthorized} = Archive.set_mark_for(stranger.id, [a.id], true)
  end

  test "API: settings endpoint and entry page carry the mark and note", %{conn: conn} do
    user = create_user()
    [a, _] = run_import(user, %{})

    body =
      conn
      |> log_in_user(user)
      |> patch("/api/me/archive", Jason.encode!(%{archive_mark: true, note: "Written at 15."}))
      |> json_response(200)

    assert body["data"]["changed"] == 2
    assert body["data"]["note"] == "Written at 15."

    entry = Repo.get!(Entry, a.id)
    page = build_conn() |> get("/api/users/#{user.username}/entries/#{entry.slug}") |> json_response(200)
    assert page["data"]["archive_mark"] == true
    assert page["data"]["imported_from"] == "livejournal"
    assert page["data"]["archive_note"] == "Written at 15."

    bulk =
      build_conn()
      |> log_in_user(user)
      |> post("/api/me/entries/bulk", Jason.encode!(%{action: "archive_mark_off", entry_ids: [a.id]}))
      |> json_response(200)

    assert bulk["count"] == 1
    refute Repo.get!(Entry, a.id).archive_mark
  end

  test "federated content says it's from the archive" do
    at = ~U[2004-12-21 20:00:00Z]

    assert Inkwell.Federation.ActivityBuilder.archive_line(%{archive_mark: true, imported_from: "livejournal", published_at: at}) ==
             "From my LiveJournal archive, first written December 21, 2004."

    assert Inkwell.Federation.ActivityBuilder.archive_line(%{archive_mark: false, imported_from: "livejournal", published_at: at}) == nil
  end
end
