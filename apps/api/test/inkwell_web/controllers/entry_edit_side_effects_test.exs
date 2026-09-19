defmodule InkwellWeb.EntryEditSideEffectsTest do
  @moduledoc """
  Three bugs from the 2026-09-19 audit, all about what saving an existing entry
  does besides saving it:

    * generated excerpts froze at first save,
    * editing an entry in a series moved it to the end of the series,
    * making a public entry private didn't tell followers' servers.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Journals
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  # Each body is different: posting the same content twice is refused as a repost.
  defp publish(user, attrs) do
    n = System.unique_integer([:positive])

    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", Map.merge(%{title: "Entry #{n}", body_html: "<p>First words #{n}.</p>", privacy: "public"}, attrs))
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp patch_entry(user, id, attrs) do
    build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", attrs)
  end

  # What the editor sends on save: everything, with a blank excerpt as null.
  defp editor_save(user, entry, attrs) do
    body =
      Map.merge(
        %{
          title: entry["title"],
          body_html: entry["body_html"],
          privacy: entry["privacy"],
          excerpt: nil,
          series_id: entry["series_id"],
          tags: []
        },
        attrs
      )

    patch_entry(user, entry["id"], body) |> json_response(200) |> Map.fetch!("data")
  end

  defp days_ago(n), do: DateTime.add(DateTime.utc_now(), -n * 86_400, :second)

  describe "excerpts" do
    test "a generated excerpt follows the body on later saves" do
      user = create_user()
      entry = publish(user, %{body_html: "<p>First words.</p>"})
      assert entry["excerpt"] == "First words."
      refute entry["excerpt_custom"]

      saved = editor_save(user, entry, %{body_html: "<p>Rewritten opening.</p>"})
      assert saved["excerpt"] == "Rewritten opening."
    end

    test "an excerpt the writer wrote is kept when the body changes" do
      user = create_user()
      entry = publish(user, %{excerpt: "My own summary"})
      assert entry["excerpt_custom"]

      saved = editor_save(user, entry, %{excerpt: "My own summary", body_html: "<p>New body.</p>"})
      assert saved["excerpt"] == "My own summary"

      # Saves that don't mention the excerpt (API clients) keep it too.
      patch_entry(user, entry["id"], %{body_html: "<p>Newer body.</p>"}) |> json_response(200)
      assert Repo.get!(Entry, entry["id"]).excerpt == "My own summary"
    end

    test "clearing a written excerpt goes back to a generated one" do
      user = create_user()
      entry = publish(user, %{excerpt: "My own summary"})

      saved = editor_save(user, entry, %{excerpt: "", body_html: "<p>Body text.</p>"})
      assert saved["excerpt"] == "Body text."
      refute saved["excerpt_custom"]
    end

    test "drafts regenerate too" do
      user = create_user()

      draft =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{body_html: "<p>Hi</p>", privacy: "public", status: "draft"})
        |> json_response(201)
        |> Map.fetch!("data")

      saved = editor_save(user, draft, %{body_html: "<p>Hi there, the draft grew.</p>"})
      assert saved["excerpt"] == "Hi there, the draft grew."
    end
  end

  describe "series order" do
    test "editing an entry keeps its place in the series" do
      user = create_user()
      {:ok, series} = Journals.create_series(%{title: "Letters", user_id: user.id})

      first = publish(user, %{series_id: series.id})
      second = publish(user, %{series_id: series.id})
      assert first["series_order"] == 1
      assert second["series_order"] == 2

      saved = editor_save(user, first, %{title: "Letter one, edited"})
      assert saved["series_order"] == 1

      saved = editor_save(user, first, %{title: "Letter one, edited again"})
      assert saved["series_order"] == 1
    end

    test "an entry joining a series goes to the end, and leaving clears its place" do
      user = create_user()
      {:ok, series} = Journals.create_series(%{title: "Letters", user_id: user.id})
      publish(user, %{series_id: series.id})
      loose = publish(user, %{})

      joined = editor_save(user, loose, %{series_id: series.id})
      assert joined["series_order"] == 2

      left = editor_save(user, joined, %{series_id: nil})
      assert left["series_id"] == nil
      assert left["series_order"] == nil
    end

    test "moving to another series takes the next place there" do
      user = create_user()
      {:ok, a} = Journals.create_series(%{title: "A", user_id: user.id})
      {:ok, b} = Journals.create_series(%{title: "B", user_id: user.id})
      publish(user, %{series_id: b.id})
      publish(user, %{series_id: b.id})
      entry = publish(user, %{series_id: a.id})

      moved = editor_save(user, entry, %{series_id: b.id})
      assert moved["series_order"] == 3
    end
  end

  describe "privacy changes and the fediverse" do
    test "public → private sends a Delete, not an Update" do
      user = create_user()
      entry = publish(user, %{})

      Oban.Testing.with_testing_mode(:manual, fn ->
        editor_save(user, entry, %{privacy: "private"})

        assert_enqueued(worker: FanOutWorker, args: %{entry_ap_id: entry["ap_id"], action: "delete", user_id: user.id})
        refute_enqueued(worker: FanOutWorker, args: %{entry_id: entry["id"]})
      end)
    end

    test "public → friends only sends a Delete" do
      user = create_user()
      entry = publish(user, %{})

      Oban.Testing.with_testing_mode(:manual, fn ->
        editor_save(user, entry, %{privacy: "friends_only"})
        assert_enqueued(worker: FanOutWorker, args: %{entry_ap_id: entry["ap_id"], action: "delete"})
      end)
    end

    test "private → public sends a Create" do
      user = create_user()
      entry = publish(user, %{privacy: "private"})

      Oban.Testing.with_testing_mode(:manual, fn ->
        editor_save(user, entry, %{privacy: "public"})

        assert_enqueued(worker: FanOutWorker, args: %{entry_id: entry["id"], action: "create"})
        refute_enqueued(worker: FanOutWorker, args: %{action: "update"})
      end)
    end

    test "public → public still sends an Update; private → private sends nothing" do
      user = create_user()
      public = publish(user, %{})
      private = publish(user, %{privacy: "private"})

      Oban.Testing.with_testing_mode(:manual, fn ->
        editor_save(user, public, %{title: "Renamed"})
        editor_save(user, private, %{title: "Renamed too"})

        assert_enqueued(worker: FanOutWorker, args: %{entry_id: public["id"], action: "update"})
        refute_enqueued(worker: FanOutWorker, args: %{entry_id: private["id"]})
        refute_enqueued(worker: FanOutWorker, args: %{action: "delete"})
      end)
    end

    test "a draft changing privacy sends nothing" do
      user = create_user()

      draft =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{body_html: "<p>Hi</p>", privacy: "public", status: "draft"})
        |> json_response(201)
        |> Map.fetch!("data")

      Oban.Testing.with_testing_mode(:manual, fn ->
        editor_save(user, draft, %{privacy: "private"})
        refute_enqueued(worker: FanOutWorker)
      end)
    end

    test "bulk privacy: public → private deletes, private → public creates (recent only)" do
      user = create_user()
      public = publish(user, %{})
      recent_private = publish(user, %{privacy: "private"})
      old_private = publish(user, %{privacy: "private", published_at: DateTime.to_iso8601(days_ago(400))})

      Oban.Testing.with_testing_mode(:manual, fn ->
        build_conn()
        |> log_in_user(user)
        |> post("/api/me/entries/bulk", %{action: "update_privacy", entry_ids: [public["id"]], privacy: "private"})
        |> json_response(200)

        assert_enqueued(worker: FanOutWorker, args: %{entry_ap_id: public["ap_id"], action: "delete"})

        build_conn()
        |> log_in_user(user)
        |> post("/api/me/entries/bulk", %{action: "update_privacy", entry_ids: [recent_private["id"], old_private["id"]], privacy: "public"})
        |> json_response(200)

        assert_enqueued(worker: FanOutWorker, args: %{entry_id: recent_private["id"], action: "create"})
        # Old posts made public in bulk aren't pushed into timelines.
        refute_enqueued(worker: FanOutWorker, args: %{entry_id: old_private["id"]})
      end)

      assert Repo.get!(Entry, public["id"]).privacy == :private
      assert Repo.get!(Entry, old_private["id"]).privacy == :public
    end

    test "bulk privacy on drafts and unchanged entries sends nothing" do
      user = create_user()
      public = publish(user, %{})

      draft =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{body_html: "<p>Hi</p>", privacy: "public", status: "draft"})
        |> json_response(201)
        |> Map.fetch!("data")

      Oban.Testing.with_testing_mode(:manual, fn ->
        build_conn()
        |> log_in_user(user)
        |> post("/api/me/entries/bulk", %{action: "update_privacy", entry_ids: [public["id"]], privacy: "public"})
        |> json_response(200)

        build_conn()
        |> log_in_user(user)
        |> post("/api/me/entries/bulk", %{action: "update_privacy", entry_ids: [draft["id"]], privacy: "private"})
        |> json_response(200)

        refute_enqueued(worker: FanOutWorker)
      end)
    end
  end
end
