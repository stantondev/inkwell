defmodule Inkwell.Federation.FollowersTest do
  @moduledoc """
  Roadmap question from m_w (2026-11-12): "I do not wish to engage with bots,
  so I want to be able to block them if they follow me."

  Before this, blocking a fediverse account left its follow in place, so a
  blocked follower kept receiving every public entry; there was no button to
  block or remove a follower at all; and nothing knew what a bot was.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.Followers
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FanOutWorker}
  alias Inkwell.Moderation.FediverseBlocks
  alias Inkwell.Social.Relationship
  alias InkwellWeb.FederationController

  defp actor_url(user), do: Inkwell.Federation.ActivityBuilder.actor_url(user)

  defp bot(attrs \\ %{}),
    do: create_remote_actor(Map.merge(%{raw_data: %{"type" => "Service"}}, attrs))

  defp person(attrs \\ %{}),
    do: create_remote_actor(Map.merge(%{raw_data: %{"type" => "Person"}}, attrs))

  defp follows(actor, user),
    do: create_relationship(%{remote_actor_id: actor.id, following_id: user.id, status: :accepted})

  defp follows?(actor, user),
    do: Repo.exists?(from r in Relationship, where: r.remote_actor_id == ^actor.id and r.following_id == ^user.id)

  defp delivered, do: all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args)

  defp manual(fun), do: Oban.Testing.with_testing_mode(:manual, fun)

  defp follow_activity(actor, user) do
    %{
      "type" => "Follow",
      "id" => "#{actor.ap_id}#follow-#{System.unique_integer([:positive])}",
      "actor" => actor.ap_id,
      "object" => actor_url(user)
    }
  end

  describe "bot?/1" do
    test "accounts typed Service or Application are bots; people and the Bluesky bridge aren't" do
      assert Followers.bot?(bot())
      assert Followers.bot?(create_remote_actor(%{raw_data: %{"type" => "Application"}}))
      refute Followers.bot?(person())
      refute Followers.bot?(create_remote_actor())
      refute Followers.bot?(nil)

      refute Followers.bot?(
               create_remote_actor(%{
                 domain: "bsky.brid.gy",
                 username: "bsky.brid.gy",
                 raw_data: %{"type" => "Application"}
               })
             )
    end
  end

  describe "remove/2" do
    test "deletes the follow, stops fan-out to them and sends a Reject of their Follow" do
      user = create_user()
      actor = person(%{shared_inbox: nil, inbox: "https://solo.example/inbox"})
      follows(actor, user)
      assert "https://solo.example/inbox" in FanOutWorker.collect_remote_inboxes(user.id)

      manual(fn ->
        assert :ok = Followers.remove(user, actor.id)

        assert [%{"activity" => reject, "inbox_url" => "https://solo.example/inbox"}] = delivered()
        assert reject["type"] == "Reject"
        assert reject["actor"] == actor_url(user)
        assert reject["object"]["type"] == "Follow"
        assert reject["object"]["actor"] == actor.ap_id
        assert reject["object"]["object"] == actor_url(user)
      end)

      refute follows?(actor, user)
      assert FanOutWorker.collect_remote_inboxes(user.id) == []
    end

    test "says so when the account doesn't follow" do
      user = create_user()
      assert {:error, :not_following} = Followers.remove(user, person().id)
    end
  end

  describe "blocking" do
    test "blocking a follower removes it, and the member's follow of it, telling both servers" do
      user = create_user()
      actor = person()
      follows(actor, user)
      create_relationship(%{follower_id: user.id, remote_actor_id: actor.id, status: :accepted})

      manual(fn ->
        {:ok, _} = FediverseBlocks.block_remote_actor(user.id, actor.id)
        types = delivered() |> Enum.map(& &1["activity"]["type"]) |> Enum.sort()
        assert types == ["Reject", "Undo"]
      end)

      refute follows?(actor, user)
      refute Repo.exists?(from r in Relationship, where: r.follower_id == ^user.id and r.remote_actor_id == ^actor.id)
    end

    test "blocking a domain removes followers from it and its subdomains only" do
      user = create_user()
      a = person(%{domain: "spam.example"})
      b = person(%{domain: "eu.spam.example"})
      c = person(%{domain: "friendly.example"})
      Enum.each([a, b, c], &follows(&1, user))

      manual(fn -> {:ok, _} = FediverseBlocks.block_domain(user.id, "Spam.Example") end)

      refute follows?(a, user)
      refute follows?(b, user)
      assert follows?(c, user)
    end
  end

  describe "declining bots" do
    defp declining(user) do
      user
      |> Ecto.Changeset.change(settings: Map.put(user.settings || %{}, "decline_bot_follows", true))
      |> Repo.update!()
    end

    test "a bot's Follow is turned down, nothing stored, nobody notified" do
      user = declining(create_user())
      actor = bot()

      manual(fn ->
        FederationController.process_activity_async(follow_activity(actor, user), user)
        assert [%{"activity" => %{"type" => "Reject", "object" => %{"type" => "Follow"}}}] = delivered()
      end)

      refute follows?(actor, user)
      refute Repo.exists?(from n in Notification, where: n.user_id == ^user.id and n.type == :fediverse_follow)
    end

    test "people are still accepted, and bots too when the member hasn't switched it on" do
      declining_user = declining(create_user())
      person = person()
      open_user = create_user()
      actor = bot()

      manual(fn ->
        FederationController.process_activity_async(follow_activity(person, declining_user), declining_user)
        FederationController.process_activity_async(follow_activity(actor, open_user), open_user)
      end)

      assert follows?(person, declining_user)
      assert follows?(actor, open_user)

      [notice] = Repo.all(from n in Notification, where: n.user_id == ^open_user.id and n.type == :fediverse_follow)
      assert notice.data["remote_actor"]["bot"] == true
    end

    test "remove_bots/1 removes bot followers and leaves people" do
      user = create_user()
      b1 = bot()
      b2 = bot(%{raw_data: %{"type" => "Application"}})
      p = person()
      Enum.each([b1, b2, p], &follows(&1, user))

      assert Enum.map(Followers.bot_followers(user.id), & &1.id) |> Enum.sort() == Enum.sort([b1.id, b2.id])
      assert manual(fn -> Followers.remove_bots(user) end) == 2
      refute follows?(b1, user)
      refute follows?(b2, user)
      assert follows?(p, user)
    end
  end

  describe "endpoints" do
    test "remove a follower, list and remove bots, save the setting", %{conn: conn} do
      user = create_user()
      p = person()
      b = bot()
      follows(p, user)
      follows(b, user)
      conn = log_in_user(conn, user)
      Oban.Testing.with_testing_mode(:manual, fn -> endpoints_flow(conn, user, p, b) end)
    end

    defp endpoints_flow(conn, user, p, b) do
      assert %{"meta" => %{"count" => 1, "declining" => false}, "data" => [%{"id" => bot_id}]} =
               conn |> get("/api/fediverse-followers/bots") |> json_response(200)

      assert bot_id == b.id

      assert %{"data" => %{"removed" => 1}} =
               conn |> post("/api/fediverse-followers/bots/remove") |> json_response(200)

      assert conn |> delete("/api/fediverse-followers/#{p.id}") |> json_response(200)
      assert conn |> delete("/api/fediverse-followers/#{p.id}") |> json_response(404)
      assert conn |> delete("/api/fediverse-followers/not-a-uuid") |> json_response(404)

      conn |> patch("/api/me", %{"settings" => %{"decline_bot_follows" => "yes"}}) |> json_response(200)
      refute Map.has_key?(Repo.reload!(user).settings, "decline_bot_follows")

      conn |> patch("/api/me", %{"settings" => %{"decline_bot_follows" => true}}) |> json_response(200)
      assert Repo.reload!(user).settings["decline_bot_follows"] == true
    end

    test "fediverse connections mark bots" do
      user = create_user()
      follows(bot(), user)
      follows(person(), user)

      bots =
        build_conn()
        |> log_in_user(user)
        |> get("/api/fediverse-connections")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["bot"])
        |> Enum.sort()

      assert bots == [false, true]
    end
  end
end
