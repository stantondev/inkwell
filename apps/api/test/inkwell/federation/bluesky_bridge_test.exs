defmodule Inkwell.Federation.BlueskyBridgeTest do
  @moduledoc """
  Settings → Share on Bluesky: following Bridgy Fed's bot turns bridging on,
  blocking it turns it off, and the bot's follow-back marks it live.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.{ActivityBuilder, BlueskyBridge}
  alias Inkwell.Federation.Workers.DeliverActivityWorker
  alias Inkwell.Repo

  setup do
    bot =
      create_remote_actor(%{
        ap_id: BlueskyBridge.bot_ap_id(),
        username: "bsky.brid.gy",
        domain: "bsky.brid.gy",
        inbox: "https://bsky.brid.gy/bsky.brid.gy/inbox",
        shared_inbox: "https://bsky.brid.gy/ap/sharedInbox"
      })

    user =
      create_user()
      |> Ecto.Changeset.change(avatar_url: "data:image/jpeg;base64,AAAA")
      |> Repo.update!()

    %{bot: bot, user: user}
  end

  defp delivered_types do
    all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args["activity"]["type"])
  end

  test "switching on follows the bot and reports pending, then active once it follows back", %{
    user: user,
    bot: bot
  } do
    # Keep deliveries queued (not sent) so they can be read.
    Oban.Testing.with_testing_mode(:manual, fn ->
      conn = build_conn() |> log_in_user(user) |> post("/api/me/bluesky")
      data = json_response(conn, 200)["data"]

      assert data["status"] == "pending"
      host = Application.get_env(:inkwell, :federation)[:instance_host]
      assert data["handle"] == "#{user.username}.#{host}.ap.brid.gy"
      assert data["profile_url"] =~ "https://bsky.app/profile/"
      assert "Follow" in delivered_types()

      create_relationship(%{remote_actor_id: bot.id, following_id: user.id, status: :accepted})
      user = Repo.reload!(user)
      assert BlueskyBridge.status(user).status == "active"
    end)
  end

  test "switching off blocks the bot; switching on again unblocks with a fresh follow id", %{
    user: user
  } do
    # Keep deliveries queued (not sent) so they can be read.
    Oban.Testing.with_testing_mode(:manual, fn ->
      {:ok, user} = BlueskyBridge.enable(user)

      [first_follow] =
        all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args["activity"])

      {:ok, user} = BlueskyBridge.disable(user)
      assert "Block" in delivered_types()
      assert BlueskyBridge.status(user).status == "off"

      {:ok, _} = BlueskyBridge.enable(user)
      activities = all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args["activity"])
      assert Enum.any?(activities, &(&1["type"] == "Undo" and &1["object"]["type"] == "Block"))
      follows = Enum.filter(activities, &(&1["type"] == "Follow"))
      assert length(follows) == 2
      assert Enum.uniq_by(follows, & &1["id"]) |> length() == 2
      assert first_follow["id"] in Enum.map(follows, & &1["id"])
    end)
  end

  test "a profile picture is required", %{user: user} do
    user = user |> Ecto.Changeset.change(avatar_url: nil) |> Repo.update!()
    conn = build_conn() |> log_in_user(user) |> post("/api/me/bluesky")
    assert json_response(conn, 422)["error"] =~ "profile picture"
  end

  test "bridge bots are recognised, ordinary servers aren't" do
    assert BlueskyBridge.bridge_actor?(%{domain: "bsky.brid.gy"})
    refute BlueskyBridge.bridge_actor?(%{domain: "mastodon.social"})
    refute BlueskyBridge.bridge_actor?(%{domain: "notbrid.gy.example"})
  end

  describe "preview Note (what Bluesky shows as the post text)" do
    defp preview(attrs) do
      user = create_user()

      {:ok, entry} =
        Inkwell.Journals.create_entry(
          Map.merge(
            %{
              user_id: user.id,
              title: "A Title",
              privacy: :public,
              status: :published,
              published_at: DateTime.utc_now()
            },
            attrs
          )
        )

      ActivityBuilder.build_article(%{entry | user: user}, user)["preview"]["content"]
    end

    test "is the excerpt alone, without repeating the title (the link card has it)" do
      html = preview(%{body_html: "<p>Morning walk &amp; coffee.</p>"})
      assert html == "<p>Morning walk &amp; coffee.</p>"
      refute html =~ "A Title"
    end

    test "a generated excerpt that stops mid-sentence still ends on a whole word with an ellipsis" do
      body = "<p>" <> String.duplicate("harbour lights ", 40) <> "</p>"
      html = preview(%{body_html: body, excerpt: String.slice(String.duplicate("harbour lights ", 40), 0, 280)})
      assert html |> String.replace(~r/<[^>]+>/, "") |> String.ends_with?("…")
    end

    test "fits Bluesky's 300 characters and ends on a whole word" do
      words = String.duplicate("lighthouse ", 60)
      html = preview(%{body_html: "<p>#{words}</p>"})
      text = html |> String.replace(~r/<[^>]+>/, "")
      assert String.length(text) <= 280
      assert String.ends_with?(text, "lighthouse…")
    end
  end

  test "actor icon/image may be an object, a string, or a list (Bridgy Fed sends a list)" do
    alias Inkwell.Federation.RemoteActor
    assert RemoteActor.media_url(%{"type" => "Image", "url" => "https://a/x.png"}) == "https://a/x.png"
    assert RemoteActor.media_url("https://a/y.png") == "https://a/y.png"
    assert RemoteActor.media_url([%{"type" => "Image", "url" => "https://a/1.png"}, %{"url" => "https://a/2.png"}]) == "https://a/1.png"
    assert RemoteActor.media_url(%{"url" => [%{"href" => "https://a/z.png"}]}) == "https://a/z.png"
    assert RemoteActor.media_url(nil) == nil
  end
end
