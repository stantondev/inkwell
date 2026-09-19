defmodule InkwellWeb.StickyTest do
  @moduledoc """
  Stickies: short posts stored as entries with kind "sticky". They mix into
  Feed and Explore, stay out of Trending and the profile's entry list, go out
  to the fediverse as Notes, and can be expanded into a journal entry.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Journals
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo
  alias InkwellWeb.StickyController

  defp as(user), do: build_conn() |> log_in_user(user)

  defp stick(user, attrs \\ %{}) do
    n = System.unique_integer([:positive])

    as(user)
    |> post("/api/stickies", Map.merge(%{body: "Thinking out loud #{n}"}, attrs))
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp explore_ids(conn) do
    conn |> get("/api/explore") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])
  end

  describe "posting" do
    test "a sticky is a published, untitled public entry with a paper color" do
      user = create_user()
      sticky = stick(user, %{body: "Just a thought."})

      assert sticky["kind"] == "sticky"
      assert sticky["sticky_color"] == "yellow"
      assert sticky["title"] == nil
      assert sticky["status"] == "published"
      assert sticky["privacy"] == "public"
      assert sticky["body_html"] == "<p>Just a thought.</p>"
      assert sticky["slug"]
    end

    test "text is escaped; links, hashtags and paragraphs are rendered" do
      user = create_user()

      sticky =
        stick(user, %{
          body: "<script>x</script> See https://example.com/a#frag. #Coffee and #café\n\nSecond line",
          color: "pink"
        })

      html = sticky["body_html"]
      refute html =~ "<script"
      assert html =~ "&lt;script&gt;"
      assert html =~ ~s(<a href="https://example.com/a#frag")
      # the period after the link isn't part of it, and #frag isn't a hashtag
      assert html =~ "</a>."
      assert html =~ ~s(class="mention hashtag")
      assert html =~ "#<span>Coffee</span>"
      assert html =~ "</p><p>Second line</p>"
      assert Enum.sort(sticky["tags"]) == ["café", "coffee"]
      assert sticky["sticky_color"] == "pink"
    end

    test "an unknown color falls back to yellow" do
      assert stick(create_user(), %{color: "chartreuse"})["sticky_color"] == "yellow"
    end

    test "empty and over-long stickies are refused" do
      user = create_user()

      res = as(user) |> post("/api/stickies", %{body: "   "}) |> json_response(422)
      assert res["error"] =~ "empty"

      res = as(user) |> post("/api/stickies", %{body: String.duplicate("a", 501)}) |> json_response(422)
      assert res["error"] =~ "500"

      assert stick(user, %{body: String.duplicate("b", 500)})["kind"] == "sticky"
    end

    test "the editor can't turn a sticky into a titled entry" do
      user = create_user()
      sticky = stick(user)

      as(user)
      |> patch("/api/entries/#{sticky["id"]}", %{title: "Now an entry", body_html: "<p>Longer</p>"})
      |> json_response(422)

      assert Repo.get!(Entry, sticky["id"]).title == nil
    end

    test "a sticky can be edited through its own endpoint, and only by its writer" do
      user = create_user()
      sticky = stick(user)

      updated =
        as(user)
        |> patch("/api/stickies/#{sticky["id"]}", %{body: "Edited #later", color: "blue"})
        |> json_response(200)
        |> Map.fetch!("data")

      assert updated["body_html"] =~ "Edited"
      assert updated["tags"] == ["later"]
      assert updated["sticky_color"] == "blue"

      as(create_user()) |> patch("/api/stickies/#{sticky["id"]}", %{body: "Mine now"}) |> json_response(403)
    end

    test "the sticky endpoint doesn't edit journal entries" do
      user = create_user()

      entry =
        as(user)
        |> post("/api/entries", %{title: "An entry", body_html: "<p>Body</p>", privacy: "public"})
        |> json_response(201)
        |> Map.fetch!("data")

      as(user) |> patch("/api/stickies/#{entry["id"]}", %{body: "hijack"}) |> json_response(404)
    end
  end

  describe "where stickies show up" do
    test "public stickies are in Explore; friends-only ones aren't" do
      user = create_user()
      public = stick(user)
      friends = stick(user, %{privacy: "friends_only"})

      ids = explore_ids(build_conn())
      assert public["id"] in ids
      refute friends["id"] in ids
    end

    test "readers who turned stickies off don't see them in Explore or Feed" do
      author = create_user()
      reader = create_user()
      create_relationship(%{follower_id: reader.id, following_id: author.id, status: :accepted})
      sticky = stick(author)

      feed_ids = fn ->
        as(Repo.get!(Inkwell.Accounts.User, reader.id))
        |> get("/api/feed")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["id"])
      end

      assert sticky["id"] in feed_ids.()
      assert sticky["id"] in explore_ids(as(reader))

      reader
      |> Ecto.Changeset.change(settings: Map.put(reader.settings || %{}, "hide_stickies", true))
      |> Repo.update!()

      reader = Repo.get!(Inkwell.Accounts.User, reader.id)
      refute sticky["id"] in feed_ids.()
      refute sticky["id"] in explore_ids(as(reader))
    end

    test "stickies stay out of Trending" do
      author = create_user()
      sticky = stick(author)
      entry =
        as(author)
        |> post("/api/entries", %{title: "Long read", body_html: "<p>Many words</p>", privacy: "public"})
        |> json_response(201)
        |> Map.fetch!("data")

      for id <- [sticky["id"], entry["id"]], do: Repo.update_all(from(e in Entry, where: e.id == ^id), set: [ink_count: 5])

      ids =
        build_conn() |> get("/api/explore/trending") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])

      assert entry["id"] in ids
      refute sticky["id"] in ids
    end

    test "the profile lists entries and stickies separately and counts only entries" do
      author = create_user()
      sticky = stick(author)

      entry =
        as(author)
        |> post("/api/entries", %{title: "Profile entry", body_html: "<p>Body</p>", privacy: "public"})
        |> json_response(201)
        |> Map.fetch!("data")

      entries = build_conn() |> get("/api/users/#{author.username}/entries") |> json_response(200)
      assert Enum.map(entries["data"], & &1["id"]) == [entry["id"]]
      assert entries["pagination"]["total"] == 1

      stickies = build_conn() |> get("/api/users/#{author.username}/entries?kind=sticky") |> json_response(200)
      assert Enum.map(stickies["data"], & &1["id"]) == [sticky["id"]]

      assert Journals.count_entries(author.id) == 1
    end
  end

  describe "fediverse" do
    test "a sticky goes out as a Note with its whole text, hashtags as tags" do
      author = create_user()
      sticky = stick(author, %{body: "A short thought about #tea"})
      entry = Repo.get!(Entry, sticky["id"])

      note = ActivityBuilder.build_article(entry, author)
      assert note["type"] == "Note"
      assert note["content"] =~ "A short thought about"
      assert note["content"] =~ "/tag/tea"
      refute note["content"] =~ ~s(href="/tag)
      refute Map.has_key?(note, "name")
      refute Map.has_key?(note, "preview")
      assert is_binary(note["url"])
      assert [%{"type" => "Hashtag", "name" => "#tea"}] = note["tag"]
    end

    test "public stickies fan out to followers" do
      author = create_user()

      Oban.Testing.with_testing_mode(:manual, fn ->
        sticky = stick(author)
        assert_enqueued(worker: Inkwell.Federation.Workers.FanOutWorker, args: %{entry_id: sticky["id"], action: "create"})
      end)
    end

    test "journal entries are still Articles" do
      author = create_user()

      entry =
        as(author)
        |> post("/api/entries", %{title: "Still an article", body_html: "<p>Body</p>", privacy: "public"})
        |> json_response(201)
        |> Map.fetch!("data")

      assert ActivityBuilder.build_article(Repo.get!(Entry, entry["id"]), author)["type"] == "Article"
    end
  end

  describe "expanding into an entry" do
    test "the entry links back to the sticky, and the sticky shows what it grew into" do
      author = create_user()
      sticky = stick(author)

      entry =
        as(author)
        |> post("/api/entries", %{
          title: "The long version",
          body_html: "<p>Expanded</p>",
          privacy: "public",
          source_sticky_id: sticky["id"]
        })
        |> json_response(201)
        |> Map.fetch!("data")

      assert entry["source_sticky_id"] == sticky["id"]

      shown =
        build_conn() |> get("/api/explore") |> json_response(200) |> Map.fetch!("data") |> Enum.find(&(&1["id"] == sticky["id"]))

      assert shown["expanded_into"]["slug"] == entry["slug"]
      assert shown["expanded_into"]["title"] == "The long version"
    end

    test "a private expansion isn't revealed to other readers" do
      author = create_user()
      sticky = stick(author)

      as(author)
      |> post("/api/entries", %{title: "Private notes", body_html: "<p>x</p>", privacy: "private", source_sticky_id: sticky["id"]})
      |> json_response(201)

      shown =
        build_conn() |> get("/api/explore") |> json_response(200) |> Map.fetch!("data") |> Enum.find(&(&1["id"] == sticky["id"]))

      assert shown["expanded_into"] == nil
    end

    test "someone else's sticky can't be claimed as a source" do
      sticky = stick(create_user())
      other = create_user()

      entry =
        as(other)
        |> post("/api/entries", %{title: "Mine", body_html: "<p>x</p>", privacy: "public", source_sticky_id: sticky["id"]})
        |> json_response(201)
        |> Map.fetch!("data")

      assert entry["source_sticky_id"] == nil
    end
  end

  test "render_body/1 handles nil and returns tags lowercased and unique" do
    assert StickyController.render_body(nil) == {"", []}
    {_, tags} = StickyController.render_body("#One #one #TWO")
    assert tags == ["one", "two"]
  end
end
