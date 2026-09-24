defmodule Inkwell.GazetteTest do
  @moduledoc """
  The Gazette rebuilt on trending links (2026-09-24): parsing Mastodon's
  trends/links, merging the same article across servers, sectioning with plain
  rules, publishing numbered editions, and the API readers and the editor use.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Repo
  alias Inkwell.Gazette.{Classifier, Conversation, Edition, Editions, Story, Trends}

  defp link(attrs) do
    Map.merge(
      %{
        "url" => "https://www.theguardian.com/environment/2026/sep/23/el-nino?utm_source=mastodon",
        "title" => "Huge El Ni&ntilde;o projected &amp; more",
        "description" => "A report.",
        "image" => "https://files.mastodon.social/cache/x.jpg",
        "provider_name" => "The Guardian",
        "author_name" => "Damian Carrington",
        "language" => "en",
        "published_at" => "2026-09-23T04:00:15.000Z",
        "history" => [%{"day" => "1", "accounts" => "171", "uses" => "180"}, %{"day" => "0", "accounts" => "132", "uses" => "140"}]
      },
      attrs
    )
  end

  defp story!(attrs) do
    now = DateTime.utc_now()
    n = System.unique_integer([:positive])

    %Story{}
    |> Story.changeset(
      Map.merge(
        %{
          url: "https://example.com/story-#{n}",
          title: "Story #{n}",
          provider_name: "Example",
          language: "en",
          shares_today: 10,
          shares_week: 10,
          topics: [],
          trending_on: ["mastodon.social"],
          first_seen_at: now,
          last_seen_at: now
        },
        attrs
      )
    )
    |> Repo.insert!()
  end

  describe "parsing trending links" do
    test "keeps the article's own headline, strips tracking, counts today's sharers" do
      [s] = Trends.parse_link(link(%{}))
      assert s.url == "https://www.theguardian.com/environment/2026/sep/23/el-nino"
      assert s.title == "Huge El Niño projected & more"
      assert s.shares_today == 171
      assert s.shares_week == 303
      assert s.provider_name == "The Guardian"
    end

    test "drops links with no title or a non-web address" do
      assert Trends.parse_link(link(%{"title" => "  "})) == []
      assert Trends.parse_link(link(%{"url" => "ftp://x.org/a"})) == []
      assert Trends.parse_link(%{"nope" => 1}) == []
    end

    test "the same article on several servers becomes one story with the highest count" do
      [a] = Trends.parse_link(link(%{}))
      [b] = Trends.parse_link(link(%{"history" => [%{"accounts" => "40"}]}))
      [merged] = Trends.merge([{"mastodon.social", a}, {"journa.host", b}])

      assert merged.shares_today == 171
      assert merged.trending_on == ["mastodon.social", "journa.host"]
      assert merged.topics == ["climate"]
      refute merged.opinion
    end
  end

  describe "sections without AI" do
    test "the publisher's own section in the address wins" do
      assert Classifier.topics(%{url: "https://site.com/technology/2026/x", title: "A story about football"}) |> hd() == "technology"
    end

    test "headline keywords when the address says nothing" do
      assert "space" in Classifier.topics(%{url: "https://x.com/a", title: "NASA rocket reaches orbit"})
      assert Classifier.topics(%{url: "https://x.com/a", title: "Something unrelated entirely"}) == []
    end

    test "opinion pieces are recognised from the address" do
      assert Classifier.opinion?("https://www.theguardian.com/commentisfree/2026/sep/24/x")
      refute Classifier.opinion?("https://www.theguardian.com/world/2026/sep/24/x")
    end
  end

  describe "editions" do
    test "ranks by sharers, caps each publisher at three, and numbers editions" do
      for i <- 1..5, do: story!(%{provider_name: "Big Paper", shares_today: 100 + i})
      small = story!(%{provider_name: "Small Paper", shares_today: 5})

      {:ok, e1} = Editions.publish()
      items = Editions.items(e1)

      assert e1.number == 1
      assert Enum.count(items, &(&1["provider_name"] == "Big Paper")) == 3
      assert Enum.any?(items, &(&1["id"] == small.id))
      assert hd(items)["shares_today"] == 105

      {:ok, e2} = Editions.publish()
      assert e2.number == 2
      assert Enum.all?(Editions.items(e2), & &1["continuing"])
    end

    test "doesn't lead two editions in a row with the same story when another is close" do
      story!(%{provider_name: "A", shares_today: 100})
      story!(%{provider_name: "B", shares_today: 90})

      {:ok, e1} = Editions.publish()
      {:ok, e2} = Editions.publish()
      refute hd(Editions.items(e1))["url"] == hd(Editions.items(e2))["url"]
    end

    test "stale stories and old articles stay out" do
      story!(%{last_seen_at: DateTime.add(DateTime.utc_now(), -2, :day)})
      story!(%{article_published_at: DateTime.add(DateTime.utc_now(), -10, :day)})
      story!(%{language: "de"})

      assert Editions.publish() == {:error, :no_stories}
    end
  end

  describe "what people are saying" do
    test "keeps public, non-bot posts, names their server, strips emoji codes" do
      posts =
        Conversation.parse(
          [
            %{"id" => "1", "url" => "https://m.s/@a/1", "visibility" => "public", "content" => "<p>hi</p>",
              "favourites_count" => 3, "reblogs_count" => 1, "created_at" => "2026-09-24T00:00:00Z",
              "account" => %{"acct" => "alice", "display_name" => "Alice :verified:", "url" => "https://m.s/@alice"}},
            %{"id" => "2", "url" => "https://m.s/@b/2", "visibility" => "unlisted", "content" => "x", "account" => %{"acct" => "b"}},
            %{"id" => "3", "url" => "https://m.s/@c/3", "visibility" => "public", "content" => "x", "account" => %{"acct" => "c", "bot" => true}},
            %{"id" => "4", "url" => "https://m.s/@d/4", "visibility" => "public", "sensitive" => true, "content" => "x", "account" => %{"acct" => "d"}}
          ],
          "m.s"
        )

      assert [%{author: %{acct: "alice@m.s", display_name: "Alice"}, likes: 3}] = posts
    end
  end

  describe "API" do
    test "an empty paper before the first edition, not an error" do
      body = build_conn() |> get("/api/gazette") |> json_response(200)
      assert body["edition"] == nil
      assert body["stories"] == []
    end

    test "the latest edition, readable signed out, with sections and method" do
      story!(%{topics: ["science"]})
      {:ok, _} = Editions.publish()

      body = build_conn() |> get("/api/gazette") |> json_response(200)
      assert body["edition"]["number"] == 1
      assert body["edition"]["latest"]
      assert [%{"topics" => ["science"], "response_count" => 0}] = body["stories"]
      assert body["method"]["per_publisher"] == 3
      assert Enum.any?(body["sections"], &(&1["id"] == "science"))

      assert build_conn() |> get("/api/gazette?edition=99") |> json_response(404)
      assert build_conn() |> get("/api/gazette/editions") |> json_response(200) |> Map.get("data") |> length() == 1
    end

    test "Write about this links an entry to its story, and it shows as a response" do
      user = create_user()
      story = story!(%{})
      {:ok, _} = Editions.publish()

      entry =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{
          title: "My take",
          body_html: "<p>Some thoughts #{System.unique_integer()}.</p>",
          privacy: "public",
          gazette_story_id: story.id
        })
        |> json_response(201)
        |> Map.fetch!("data")

      assert Repo.get(Inkwell.Journals.Entry, entry["id"]).gazette_story_id == story.id

      body = build_conn() |> get("/api/gazette") |> json_response(200)
      assert [%{"response_count" => 1}] = body["stories"]
      assert [%{"title" => "My take"}] = body["responses"]

      story_body = build_conn() |> get("/api/gazette/stories/#{story.id}") |> json_response(200)
      assert [%{"title" => "My take"}] = story_body["responses"]
    end

    test "a made-up story id on an entry is dropped, not an error" do
      user = create_user()

      entry =
        build_conn()
        |> log_in_user(user)
        |> post("/api/entries", %{
          title: "Nothing to see",
          body_html: "<p>Body #{System.unique_integer()}.</p>",
          privacy: "public",
          gazette_story_id: Ecto.UUID.generate()
        })
        |> json_response(201)
        |> Map.fetch!("data")

      assert Repo.get(Inkwell.Journals.Entry, entry["id"]).gazette_story_id == nil
    end

    test "unknown stories are 404" do
      assert build_conn() |> get("/api/gazette/stories/nope") |> json_response(404)
      assert build_conn() |> get("/api/gazette/stories/#{Ecto.UUID.generate()}") |> json_response(404)
    end
  end

  test "pruning keeps stories someone wrote about" do
    old = DateTime.add(DateTime.utc_now(), -30, :day)
    kept = story!(%{last_seen_at: old})
    gone = story!(%{last_seen_at: old})

    user = create_user()

    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", %{title: "Old news", body_html: "<p>Hm #{System.unique_integer()}.</p>", privacy: "public", gazette_story_id: kept.id})
    |> json_response(201)

    Trends.prune()
    assert Repo.get(Story, kept.id)
    refute Repo.get(Story, gone.id)
    assert Repo.aggregate(Edition, :count) == 0
  end
end
