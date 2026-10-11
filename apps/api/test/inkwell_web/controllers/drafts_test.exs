defmodule InkwellWeb.DraftsTest do
  @moduledoc """
  The drafts work of 2026-10-11 (roadmap "Improve UI/UX for Drafts"): the
  drafts list pages, searches and sorts; the free limit is 25 and leaves out
  scheduled and imported drafts; bulk delete skips drafts already gone; only
  empty drafts are ever cleared automatically; word counts follow the body on
  every save; footnotes load on entries that aren't public.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals
  alias Inkwell.Journals.{Comment, Entry}
  alias Inkwell.Repo

  defp draft(user, attrs \\ %{}) do
    Repo.insert!(
      struct(
        Entry,
        Map.merge(
          %{
            user_id: user.id,
            title: "Draft #{System.unique_integer([:positive])}",
            body_html: "<p>some words here</p>",
            status: :draft,
            privacy: :public
          },
          attrs
        )
      )
    )
  end

  defp days_ago(n), do: DateTime.add(DateTime.utc_now(), -n * 86_400, :second)

  defp make_plus(user) do
    user
    |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active")
    |> Repo.update!()
  end

  defp get_drafts(user, query \\ "") do
    build_conn() |> log_in_user(user) |> get("/api/drafts" <> query) |> json_response(200)
  end

  describe "GET /api/drafts" do
    test "pages with a total, and says how many count toward the limit" do
      user = create_user()
      for _ <- 1..23, do: draft(user)
      draft(user, %{scheduled_at: DateTime.add(DateTime.utc_now(), 86_400, :second)})
      draft(user, %{source: "import"})
      draft(create_user())

      first = get_drafts(user)
      assert length(first["data"]) == 20
      assert first["pagination"]["total"] == 25
      assert first["pagination"]["total_pages"] == 2
      assert first["meta"] == %{"draft_limit" => 25, "counted" => 23, "scheduled" => 1}

      second = get_drafts(user, "?page=2")
      assert length(second["data"]) == 5

      ids = Enum.map(first["data"] ++ second["data"], & &1["id"])
      assert length(Enum.uniq(ids)) == 25
    end

    test "searches title and text, sorts, and gives untitled drafts their opening words" do
      user = create_user()
      draft(user, %{title: "Zebra crossing", updated_at: days_ago(3)})
      draft(user, %{title: nil, body_html: "<p>Rain on the &amp; window</p><p>second</p>", updated_at: days_ago(2)})
      draft(user, %{title: "apple orchard", updated_at: days_ago(1)})

      found = get_drafts(user, "?q=window")
      assert [%{"title" => nil, "preview_text" => "Rain on the & window second"}] = found["data"]
      assert found["pagination"]["total"] == 1

      assert Enum.map(get_drafts(user, "?sort=title")["data"], & &1["title"]) ==
               ["apple orchard", "Zebra crossing", nil]

      assert hd(get_drafts(user)["data"])["title"] == "apple orchard"
      assert get_drafts(user, "?q=%25")["pagination"]["total"] == 3
    end

    test "Plus has no limit" do
      user = create_user() |> make_plus()
      assert get_drafts(user)["meta"]["draft_limit"] == nil
    end
  end

  describe "the free draft limit" do
    defp new_draft(user) do
      build_conn()
      |> log_in_user(user)
      |> post("/api/entries", %{status: "draft", title: "New #{System.unique_integer()}", body_html: "<p>x</p>"})
    end

    test "is 25, and scheduled and imported drafts don't count" do
      user = create_user()
      for _ <- 1..24, do: draft(user)
      for _ <- 1..30, do: draft(user, %{source: "import"})
      draft(user, %{scheduled_at: DateTime.add(DateTime.utc_now(), 86_400, :second)})

      assert new_draft(user).status == 201
      assert %{"error" => "draft_limit_reached", "limit" => 25} = json_response(new_draft(user), 422)
    end
  end

  describe "bulk delete" do
    test "skips drafts already deleted but refuses someone else's" do
      user = create_user()
      a = draft(user)
      b = draft(user)
      gone = draft(user)
      Repo.delete!(gone)

      resp =
        build_conn()
        |> log_in_user(user)
        |> post("/api/me/entries/bulk", %{action: "delete", entry_ids: [a.id, gone.id]})
        |> json_response(200)

      assert resp["count"] == 1
      refute Repo.get(Entry, a.id)

      other = draft(create_user())

      build_conn()
      |> log_in_user(user)
      |> post("/api/me/entries/bulk", %{action: "delete", entry_ids: [b.id, other.id]})
      |> json_response(403)

      assert Repo.get(Entry, b.id)
      assert Repo.get(Entry, other.id)
    end
  end

  describe "automatic cleanup" do
    test "clears only drafts with nothing in them, and keeps old drafts with content" do
      user = create_user()
      old = days_ago(400)
      empty = draft(user, %{title: nil, body_html: "<p data-spacing=\"tight\"></p>", updated_at: old})
      blank_title = draft(user, %{title: "  ", body_html: "<p>&nbsp;</p>", updated_at: old})
      words = draft(user, %{title: nil, body_html: "<p>a thought</p>", updated_at: old})
      titled = draft(user, %{title: "Someday", body_html: "", updated_at: old})
      picture = draft(user, %{title: nil, body_html: "<p><img src=\"/api/images/x\"></p>", updated_at: old})
      recent_empty = draft(user, %{title: nil, body_html: "<p></p>", updated_at: days_ago(5)})

      assert {:ok, 2} = Journals.cleanup_abandoned_drafts()

      refute Repo.get(Entry, empty.id)
      refute Repo.get(Entry, blank_title.id)
      for kept <- [words, titled, picture, recent_empty], do: assert(Repo.get(Entry, kept.id))
    end
  end

  describe "word counts" do
    test "are computed on every save path, including drafts and stickies" do
      user = create_user()

      {:ok, d} = Journals.create_draft(%{user_id: user.id, body_html: "<p>one two&nbsp;three</p><p>— four</p>"})
      assert d.word_count == 4

      {:ok, d} = Journals.update_draft(d, %{body_html: "<p>just two</p>"})
      assert d.word_count == 2

      sticky =
        build_conn()
        |> log_in_user(user)
        |> post("/api/stickies", %{body: "a short thought with six words", privacy: "public"})
        |> json_response(201)

      assert Repo.get(Entry, sticky["data"]["id"]).word_count == 6
    end
  end

  describe "footnotes on entries that aren't public" do
    test "load for the writer, and stay hidden from strangers" do
      writer = create_user()

      entry =
        draft(writer, %{
          status: :published,
          privacy: :private,
          slug: "secret",
          published_at: days_ago(1)
        })

      Repo.insert!(%Comment{entry_id: entry.id, user_id: writer.id, body_html: "<p>note to self</p>"})
      path = "/api/users/#{writer.username}/entries/secret/comments"

      assert [%{"body_html" => "<p>note to self</p>"}] =
               build_conn() |> log_in_user(writer) |> get(path) |> json_response(200) |> Map.get("data")

      build_conn() |> log_in_user(create_user()) |> get(path) |> json_response(404)
      build_conn() |> get(path) |> json_response(404)
    end
  end

  describe "the writer's own entry" do
    test "includes its read count for the writer only" do
      writer = create_user()
      entry = draft(writer, %{status: :published, slug: "read-me", published_at: days_ago(1)})

      own = build_conn() |> log_in_user(writer) |> get("/api/users/#{writer.username}/entries/read-me") |> json_response(200)
      assert own["data"]["read_count"] == 0

      other = build_conn() |> get("/api/users/#{writer.username}/entries/read-me") |> json_response(200)
      refute Map.has_key?(other["data"], "read_count")

      assert build_conn() |> log_in_user(writer) |> get("/api/entries/#{entry.id}") |> json_response(200) |> get_in(["data", "read_count"]) == 0
    end
  end
end
