defmodule InkwellWeb.BulkPostsTest do
  @moduledoc """
  The Posts page (/manage) bulk tools: select across pages, bulk category, and
  publishing old imported drafts without flooding fediverse followers.
  Roadmap: "Bulk manage posts".
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp entry(user, attrs) do
    Repo.insert!(
      struct(
        Entry,
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{System.unique_integer([:positive])}",
            body_html: "<p>hi</p>",
            status: :draft,
            privacy: :public
          },
          attrs
        )
      )
    )
  end

  defp days_ago(n), do: DateTime.add(DateTime.utc_now(), -n * 86_400, :second)

  defp bulk(user, body) do
    build_conn() |> log_in_user(user) |> post("/api/me/entries/bulk", body)
  end

  describe "GET /api/me/entries/ids" do
    test "returns every matching entry, not just a page, sorted by entry date" do
      user = create_user()
      old = entry(user, %{published_at: days_ago(3000)})
      for _ <- 1..25, do: entry(user, %{})
      newest_published = entry(user, %{status: :published, slug: "p", published_at: days_ago(1)})
      entry(create_user(), %{})

      all = build_conn() |> log_in_user(user) |> get("/api/me/entries/ids") |> json_response(200)
      assert length(all["data"]) == 27
      assert List.last(all["data"])["id"] == old.id

      drafts =
        build_conn() |> log_in_user(user) |> get("/api/me/entries/ids?status=draft") |> json_response(200)

      assert length(drafts["data"]) == 26
      refute Enum.any?(drafts["data"], &(&1["id"] == newest_published.id))
      assert Enum.all?(drafts["data"], &(&1["status"] == "draft"))
    end
  end

  describe "set_category" do
    test "sets and clears the category on the writer's own entries" do
      user = create_user()
      a = entry(user, %{})
      b = entry(user, %{category: :poetry})

      bulk(user, %{action: "set_category", entry_ids: [a.id, b.id], category: "travel"}) |> json_response(200)
      assert Repo.get!(Entry, a.id).category == :travel
      assert Repo.get!(Entry, b.id).category == :travel

      bulk(user, %{action: "set_category", entry_ids: [a.id], category: ""}) |> json_response(200)
      assert Repo.get!(Entry, a.id).category == nil
    end

    test "rejects unknown categories and other people's entries" do
      user = create_user()
      mine = entry(user, %{})
      theirs = entry(create_user(), %{})

      bulk(user, %{action: "set_category", entry_ids: [mine.id], category: "nonsense"}) |> json_response(400)
      bulk(user, %{action: "set_category", entry_ids: [mine.id, theirs.id], category: "travel"}) |> json_response(403)
      assert Repo.get!(Entry, theirs.id).category == nil
    end
  end

  describe "publishing old drafts" do
    test "older posts publish quietly; recent ones still go to followers" do
      user = create_user()
      old = entry(user, %{published_at: days_ago(3000)})
      recent = entry(user, %{published_at: days_ago(2)})
      undated = entry(user, %{})

      Oban.Testing.with_testing_mode(:manual, fn ->
        bulk(user, %{action: "publish", entry_ids: [old.id, recent.id, undated.id]}) |> json_response(200)

        refute_enqueued(worker: FanOutWorker, args: %{entry_id: old.id})
        assert_enqueued(worker: FanOutWorker, args: %{entry_id: recent.id, action: "create"})
        assert_enqueued(worker: FanOutWorker, args: %{entry_id: undated.id, action: "create"})
      end)

      assert Repo.get!(Entry, old.id).status == :published
      assert Repo.get!(Entry, old.id).published_at == Repo.reload!(old).published_at
    end

    test "federate_older sends the older ones too" do
      user = create_user()
      old = entry(user, %{published_at: days_ago(3000)})

      Oban.Testing.with_testing_mode(:manual, fn ->
        bulk(user, %{action: "publish", entry_ids: [old.id], federate_older: true}) |> json_response(200)
        assert_enqueued(worker: FanOutWorker, args: %{entry_id: old.id, action: "create"})
      end)
    end
  end
end
