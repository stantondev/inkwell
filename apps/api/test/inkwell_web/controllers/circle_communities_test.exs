defmodule InkwellWeb.CircleCommunitiesTest do
  @moduledoc """
  Circles rebuilt as LiveJournal-style communities (2026-09-24): members post
  ordinary entries to a circle, those show in members' Feeds, "circle members
  only" is a privacy setting, and anyone established can start a circle.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.Accounts.{Notification, User}
  alias Inkwell.Circles
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp established(attrs \\ %{}) do
    user = create_user(attrs)
    old = NaiveDateTime.add(NaiveDateTime.utc_now(), -30 * 86_400, :second)
    from(u in User, where: u.id == ^user.id) |> Repo.update_all(set: [inserted_at: old])
    Repo.get!(User, user.id)
  end

  defp conn_for(user), do: build_conn() |> log_in_user(user)

  defp make_circle(owner, name \\ "Writing Workshop") do
    conn_for(owner)
    |> post("/api/circles", %{name: name, category: "writing_craft", description: "<p>Drafts and feedback.</p>"})
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp join(user, circle), do: conn_for(user) |> post("/api/circles/#{circle["id"]}/join") |> json_response(200)

  defp post_entry(user, attrs) do
    n = System.unique_integer([:positive])

    conn_for(user)
    |> post("/api/entries", Map.merge(%{title: "Entry #{n}", body_html: "<p>Words #{n}.</p>", privacy: "public"}, attrs))
  end

  defp feed_ids(user) do
    conn_for(user) |> get("/api/feed") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])
  end

  defp circle_entry_ids(viewer, circle, query \\ "") do
    conn = if viewer, do: conn_for(viewer), else: build_conn()

    conn
    |> get("/api/circles/#{circle["id"]}/entries#{query}")
    |> json_response(200)
    |> Map.fetch!("data")
    |> Enum.map(& &1["id"])
  end

  describe "starting a circle" do
    test "anyone established can, not just Plus" do
      owner = established()
      circle = make_circle(owner)
      assert circle["slug"]
    end

    test "accounts under a week old can't, and are told why" do
      body = conn_for(create_user()) |> post("/api/circles", %{name: "Too soon", category: "community"}) |> json_response(403)
      assert body["code"] == "too_new"
      assert body["error"] =~ "7 days"
    end

    test "moderation-limited accounts can't" do
      user = established()
      from(u in User, where: u.id == ^user.id) |> Repo.update_all(set: [moderation_state: "limited"])
      assert conn_for(user) |> post("/api/circles", %{name: "Nope", category: "community"}) |> json_response(403)
    end

    test "the free plan stops at 3 circles" do
      owner = established()
      for i <- 1..3, do: make_circle(owner, "Circle #{i}")

      body = conn_for(owner) |> post("/api/circles", %{name: "Fourth", category: "community"}) |> json_response(403)
      assert body["code"] == "limit_reached"

      meta = conn_for(owner) |> get("/api/my-circles") |> json_response(200) |> Map.fetch!("meta")
      refute meta["can_create"]
      assert meta["circle_limit"] == 3
    end
  end

  describe "posting to a circle" do
    test "members post entries; they show on the circle page and in other members' Feeds" do
      owner = established()
      member = established()
      stranger = established()
      circle = make_circle(owner)
      join(member, circle)

      entry = post_entry(member, %{circle_id: circle["id"]}) |> json_response(201) |> Map.fetch!("data")
      assert entry["circle_id"] == circle["id"]

      # On the circle page, for everyone (it's public)
      assert entry["id"] in circle_entry_ids(nil, circle)
      # In the owner's Feed although the owner doesn't follow the writer
      assert entry["id"] in feed_ids(owner)
      # Not in the Feed of someone outside the circle
      refute entry["id"] in feed_ids(stranger)

      item = conn_for(owner) |> get("/api/feed") |> json_response(200) |> Map.fetch!("data") |> Enum.find(&(&1["id"] == entry["id"]))
      assert item["circle"]["name"] == "Writing Workshop"
    end

    test "non-members can't post in a circle" do
      owner = established()
      circle = make_circle(owner)
      assert post_entry(established(), %{circle_id: circle["id"]}) |> json_response(422)
    end

    test "a post in a circle is public or for members, never friends-only" do
      owner = established()
      circle = make_circle(owner)
      body = post_entry(owner, %{circle_id: circle["id"], privacy: "friends_only"}) |> json_response(422)
      assert body["errors"]["privacy"]
    end

    test "members-only posts are for members" do
      owner = established()
      member = established()
      stranger = established()
      circle = make_circle(owner)
      join(member, circle)

      entry = post_entry(owner, %{circle_id: circle["id"], privacy: "circle"}) |> json_response(201) |> Map.fetch!("data")
      author = Repo.get!(User, owner.id)
      path = "/api/users/#{author.username}/entries/#{entry["slug"]}"

      assert entry["id"] in circle_entry_ids(member, circle)
      refute entry["id"] in circle_entry_ids(stranger, circle)
      refute entry["id"] in circle_entry_ids(nil, circle)

      assert conn_for(member) |> get(path) |> json_response(200)
      assert conn_for(stranger) |> get(path) |> json_response(404)
      assert build_conn() |> get(path) |> json_response(404)

      # On the writer's profile only for members
      profile = fn viewer ->
        conn_for(viewer) |> get("/api/users/#{author.username}/entries") |> json_response(200) |> Map.fetch!("data") |> Enum.map(& &1["id"])
      end

      assert entry["id"] in profile.(member)
      refute entry["id"] in profile.(stranger)

      assert entry["id"] in feed_ids(member)
      refute entry["id"] in feed_ids(stranger)
    end

    test "members-only posts never go to the fediverse" do
      owner = established()
      circle = make_circle(owner)
      post_entry(owner, %{circle_id: circle["id"], privacy: "circle"}) |> json_response(201)
      refute_enqueued(worker: Inkwell.Federation.Workers.FanOutWorker)
    end

    test "circle members only needs a circle" do
      body = post_entry(established(), %{privacy: "circle"}) |> json_response(422)
      assert body["errors"]["privacy"]
    end
  end

  describe "prompts" do
    test "a moderator pins a prompt, members hear about it, answers link back" do
      owner = established()
      member = established()
      circle = make_circle(owner)
      join(member, circle)

      prompt = post_entry(owner, %{circle_id: circle["id"], title: "What are you reading?"}) |> json_response(201) |> Map.fetch!("data")
      conn_for(owner) |> post("/api/circles/#{circle["id"]}/prompt", %{entry_id: prompt["id"]}) |> json_response(200)

      assert Repo.exists?(from n in Notification, where: n.user_id == ^member.id and n.type == :circle_prompt)

      shown = conn_for(member) |> get("/api/circles/#{circle["slug"]}") |> json_response(200) |> Map.fetch!("data")
      assert shown["prompt"]["id"] == prompt["id"]

      answer =
        post_entry(member, %{circle_id: circle["id"], circle_prompt_id: prompt["id"]})
        |> json_response(201)
        |> Map.fetch!("data")

      assert answer["circle_prompt_id"] == prompt["id"]
      assert Repo.exists?(from n in Notification, where: n.user_id == ^owner.id and n.type == :circle_prompt_response)
      assert circle_entry_ids(member, circle, "?prompt=#{prompt["id"]}") == [answer["id"]]
    end

    test "plain members can't set the prompt" do
      owner = established()
      member = established()
      circle = make_circle(owner)
      join(member, circle)
      entry = post_entry(member, %{circle_id: circle["id"]}) |> json_response(201) |> Map.fetch!("data")
      assert conn_for(member) |> post("/api/circles/#{circle["id"]}/prompt", %{entry_id: entry["id"]}) |> json_response(403)
    end

    test "a prompt from another circle is dropped" do
      owner = established()
      a = make_circle(owner, "Circle A")
      b = make_circle(owner, "Circle B")
      prompt = post_entry(owner, %{circle_id: a["id"]}) |> json_response(201) |> Map.fetch!("data")
      answer = post_entry(owner, %{circle_id: b["id"], circle_prompt_id: prompt["id"]}) |> json_response(201) |> Map.fetch!("data")
      assert answer["circle_prompt_id"] == nil
    end
  end

  describe "removing posts and circles" do
    test "the owner takes a post out; a members-only post becomes private" do
      owner = established()
      member = established()
      circle = make_circle(owner)
      join(member, circle)
      entry = post_entry(member, %{circle_id: circle["id"], privacy: "circle"}) |> json_response(201) |> Map.fetch!("data")

      conn_for(owner) |> delete("/api/circles/#{circle["id"]}/entries/#{entry["id"]}") |> json_response(200)

      reloaded = Repo.get!(Entry, entry["id"])
      assert reloaded.circle_id == nil
      assert reloaded.privacy == :private
    end

    test "other members can't take someone's post out" do
      owner = established()
      a = established()
      b = established()
      circle = make_circle(owner)
      join(a, circle)
      join(b, circle)
      entry = post_entry(a, %{circle_id: circle["id"]}) |> json_response(201) |> Map.fetch!("data")
      assert conn_for(b) |> delete("/api/circles/#{circle["id"]}/entries/#{entry["id"]}") |> json_response(403)
    end

    test "deleting a circle leaves members-only posts private, not orphaned" do
      owner = established()
      circle = make_circle(owner)
      entry = post_entry(owner, %{circle_id: circle["id"], privacy: "circle"}) |> json_response(201) |> Map.fetch!("data")
      conn_for(owner) |> delete("/api/circles/#{circle["id"]}") |> json_response(200)
      assert Repo.get!(Entry, entry["id"]).privacy == :private
    end
  end

  describe "unread and the archive" do
    test "new posts by others count as unread until the member opens the circle" do
      owner = established()
      member = established()
      circle = make_circle(owner)
      join(member, circle)
      post_entry(owner, %{circle_id: circle["id"]}) |> json_response(201)

      unread = fn -> conn_for(member) |> get("/api/my-circles") |> json_response(200) |> Map.fetch!("data") |> hd() |> Map.fetch!("unread_count") end
      assert unread.() == 1

      conn_for(member) |> get("/api/circles/#{circle["slug"]}") |> json_response(200)
      assert unread.() == 0
    end

    test "new discussions are closed; the archive stays readable" do
      owner = established()
      circle = make_circle(owner)
      assert conn_for(owner) |> post("/api/circles/#{circle["id"]}/discussions", %{title: "Hi", body: "Hi"}) |> json_response(410)
      assert conn_for(owner) |> get("/api/circles/#{circle["id"]}/discussions") |> json_response(200)
    end

    test "circle avatars are URLs, not inline images" do
      owner = established()
      from(u in User, where: u.id == ^owner.id) |> Repo.update_all(set: [avatar_url: "data:image/png;base64,iVBORw0KGgo="])
      circle = make_circle(owner)
      shown = build_conn() |> get("/api/circles/#{circle["slug"]}") |> json_response(200) |> Map.fetch!("data")
      assert shown["owner"]["avatar_url"] =~ "/api/avatars/"
    end
  end

  test "Circles.unread_counts ignores the member's own posts" do
    owner = established()
    circle = make_circle(owner)
    post_entry(owner, %{circle_id: circle["id"]}) |> json_response(201)
    assert Circles.unread_counts(owner.id) == %{}
  end
end
