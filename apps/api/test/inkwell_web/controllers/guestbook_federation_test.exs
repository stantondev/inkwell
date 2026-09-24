defmodule InkwellWeb.GuestbookFederationTest do
  @moduledoc """
  The guestbook as an FEP-400e publicly-appendable collection, and the actor's
  FEP-2345 `attributionDomains`.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Federation.Workers.DeliverActivityWorker
  alias Inkwell.Guestbook
  alias Inkwell.Guestbook.GuestbookEntry
  alias Inkwell.Moderation.FediverseBlocks
  alias Inkwell.Repo
  alias InkwellWeb.FederationController

  @public "https://www.w3.org/ns/activitystreams#Public"

  defp ap(conn), do: put_req_header(conn, "accept", "application/activity+json")
  defp gb_url(user), do: "#{ActivityBuilder.actor_url(user)}/guestbook"

  defp signature(actor, owner, attrs \\ %{}) do
    Map.merge(
      %{
        "type" => "Note",
        "id" => "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
        "attributedTo" => actor.ap_id,
        "content" => "<p>@#{owner.username} What a lovely &amp; strange corner of the web.</p>",
        "to" => [@public],
        "cc" => [ActivityBuilder.actor_url(owner)],
        "target" => %{
          "type" => "OrderedCollection",
          "id" => gb_url(owner),
          "attributedTo" => ActivityBuilder.actor_url(owner)
        }
      },
      attrs
    )
  end

  defp deliver(actor, owner, note) do
    Oban.Testing.with_testing_mode(:manual, fn ->
      FederationController.process_activity_async(
        %{"type" => "Create", "actor" => actor.ap_id, "object" => note},
        owner
      )

      all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args)
    end)
  end

  defp entries(owner), do: Repo.all(from g in GuestbookEntry, where: g.profile_user_id == ^owner.id)

  defp notifications(owner),
    do: Repo.all(from n in Notification, where: n.user_id == ^owner.id and n.type == :guestbook)

  describe "actor" do
    test "advertises the guestbook and the domains that may credit it", %{conn: conn} do
      user = create_user()
      person = conn |> ap() |> get("/users/#{user.username}") |> json_response(200)

      assert person["guestbook"] == gb_url(user)
      assert person["attributionDomains"] == ["inkwell.test"]

      assert Enum.any?(person["@context"], fn
               %{"attributionDomains" => %{"@id" => "https://joinmastodon.org/ns#attributionDomains"}} -> true
               _ -> false
             end)
    end

    test "an active custom domain is listed too" do
      user = create_user()

      Repo.insert!(%Inkwell.CustomDomains.CustomDomain{
        user_id: user.id,
        domain: "writes.example",
        status: "active"
      })

      assert ActivityBuilder.build_person(user)["attributionDomains"] == ["inkwell.test", "writes.example"]
    end

    test "the relay actor has no guestbook" do
      relay = create_user(%{username: Inkwell.Federation.InstanceActor.username()})
      refute Map.has_key?(ActivityBuilder.build_person(relay), "guestbook")
    end
  end

  describe "serving the collection" do
    test "lists signatures newest first: ours by our Note URL, fediverse ones by their id", %{conn: conn} do
      owner = create_user()
      visitor = create_user()
      {:ok, local} = Guestbook.create_entry(%{"body" => "hi", "profile_user_id" => owner.id, "author_id" => visitor.id})

      {:ok, remote} =
        Guestbook.create_entry_from_ap(%{
          body: "hello from afar",
          profile_user_id: owner.id,
          ap_id: "https://mastodon.example/statuses/1",
          remote_author: %{ap_id: "https://mastodon.example/users/a"}
        })

      Repo.update_all(from(g in GuestbookEntry, where: g.id == ^local.id),
        set: [inserted_at: DateTime.add(DateTime.utc_now(), -60, :second)]
      )

      coll = conn |> ap() |> get("/users/#{owner.username}/guestbook") |> json_response(200)
      assert coll["type"] == "OrderedCollection"
      assert coll["totalItems"] == 2
      assert coll["first"] == "#{gb_url(owner)}?page=1"

      page = build_conn() |> ap() |> get("/users/#{owner.username}/guestbook?page=1") |> json_response(200)
      assert page["type"] == "OrderedCollectionPage"
      assert page["orderedItems"] == [remote.ap_id, "#{gb_url(owner)}/#{local.id}"]
      refute Map.has_key?(page, "next")
    end

    test "signatures from suspended accounts are left out", %{conn: conn} do
      owner = create_user()
      gone = create_user()
      {:ok, _} = Guestbook.create_entry(%{"body" => "hi", "profile_user_id" => owner.id, "author_id" => gone.id})
      gone |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

      coll = conn |> ap() |> get("/users/#{owner.username}/guestbook") |> json_response(200)
      assert coll["totalItems"] == 0
    end

    test "a signature written here is a Note targeting the guestbook", %{conn: conn} do
      owner = create_user()
      visitor = create_user()

      {:ok, entry} =
        Guestbook.create_entry(%{"body" => "Line one <b>\n\nLine two", "profile_user_id" => owner.id, "author_id" => visitor.id})

      note = conn |> ap() |> get("/users/#{owner.username}/guestbook/#{entry.id}") |> json_response(200)

      assert note["type"] == "Note"
      assert note["attributedTo"] == ActivityBuilder.actor_url(visitor)
      assert note["content"] == "<p>Line one &lt;b&gt;</p><p>Line two</p>"
      assert note["target"]["id"] == gb_url(owner)
      assert note["target"]["attributedTo"] == ActivityBuilder.actor_url(owner)
      assert @public in note["to"]
    end

    test "fediverse signatures and bad ids aren't served here", %{conn: conn} do
      owner = create_user()

      {:ok, remote} =
        Guestbook.create_entry_from_ap(%{
          body: "x",
          profile_user_id: owner.id,
          ap_id: "https://mastodon.example/statuses/2",
          remote_author: %{ap_id: "https://mastodon.example/users/a"}
        })

      conn |> ap() |> get("/users/#{owner.username}/guestbook/#{remote.id}") |> json_response(404)
      build_conn() |> ap() |> get("/users/#{owner.username}/guestbook/not-a-uuid") |> json_response(404)
    end

    test "browsers are sent to the profile's guestbook", %{conn: conn} do
      owner = create_user()
      conn = get(conn, "/users/#{owner.username}/guestbook")
      assert redirected_to(conn, 302) == "https://inkwell.test/#{owner.username}#guestbook"
    end
  end

  describe "receiving a signature (Create with target)" do
    test "stores it, notifies the owner once, and answers with Add" do
      owner = create_user()
      actor = create_remote_actor()
      note = signature(actor, owner)

      assert [delivery] = deliver(actor, owner, note)

      assert [entry] = entries(owner)
      assert entry.body == "What a lovely & strange corner of the web."
      assert entry.ap_id == note["id"]
      assert [_] = notifications(owner)

      assert delivery["inbox_url"] == actor.inbox
      assert delivery["activity"]["type"] == "Add"
      assert delivery["activity"]["object"] == note["id"]
      assert delivery["activity"]["target"] == gb_url(owner)
      assert delivery["activity"]["actor"] == ActivityBuilder.actor_url(owner)

      # A redelivery is still one signature and one notification
      deliver(actor, owner, note)
      assert [_] = entries(owner)
      assert [_] = notifications(owner)
    end

    test "target can be just the collection id" do
      owner = create_user()
      actor = create_remote_actor()
      deliver(actor, owner, signature(actor, owner, %{"target" => gb_url(owner)}))
      assert [_] = entries(owner)
    end

    test "a non-public signature is ignored" do
      owner = create_user()
      actor = create_remote_actor()

      assert [] ==
               deliver(actor, owner, signature(actor, owner, %{"to" => [ActivityBuilder.actor_url(owner)], "cc" => []}))

      assert entries(owner) == []
    end

    test "a note attributed to someone other than its sender is ignored" do
      owner = create_user()
      actor = create_remote_actor()
      other = create_remote_actor()

      assert [] == deliver(actor, owner, signature(actor, owner, %{"attributedTo" => other.ap_id}))
      assert entries(owner) == []
    end

    test "a target on another server isn't our guestbook" do
      owner = create_user()
      actor = create_remote_actor()

      deliver(actor, owner, signature(actor, owner, %{"target" => "https://elsewhere.example/users/#{owner.username}/guestbook"}))
      assert entries(owner) == []
    end

    test "a blocked account can't sign, and gets no Add" do
      owner = create_user()
      actor = create_remote_actor()
      {:ok, _} = FediverseBlocks.block_remote_actor(owner.id, actor.id)

      assert [] == deliver(actor, owner, signature(actor, owner))
      assert entries(owner) == []
    end
  end

  describe "taking a signature down" do
    test "the owner removing a fediverse signature sends Remove to its author" do
      owner = create_user()
      actor = create_remote_actor()
      deliver(actor, owner, signature(actor, owner))
      [entry] = entries(owner)

      deliveries =
        Oban.Testing.with_testing_mode(:manual, fn ->
          build_conn() |> log_in_user(owner) |> delete("/api/guestbook/#{entry.id}") |> json_response(200)
          all_enqueued(worker: DeliverActivityWorker)
          |> Enum.map(& &1.args)
          |> Enum.filter(&(&1["activity"]["type"] == "Remove"))
        end)

      assert [%{"activity" => %{"type" => "Remove", "object" => object, "target" => target}}] = deliveries
      assert object == entry.ap_id
      assert target == gb_url(owner)
    end

    test "removing a signature written here sends nothing" do
      owner = create_user()
      visitor = create_user()
      {:ok, entry} = Guestbook.create_entry(%{"body" => "hi", "profile_user_id" => owner.id, "author_id" => visitor.id})

      deliveries =
        Oban.Testing.with_testing_mode(:manual, fn ->
          build_conn() |> log_in_user(owner) |> delete("/api/guestbook/#{entry.id}") |> json_response(200)
          all_enqueued(worker: DeliverActivityWorker)
        end)

      assert deliveries == []
    end
  end
end
