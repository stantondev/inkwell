defmodule Inkwell.Federation.CommentFederationTest do
  @moduledoc """
  Footnotes leave the fediverse when they leave Inkwell: deleted, edited, or
  gone with their entry (deleted, made private, hidden), and a deleted account
  takes everything with it. Until 2026-10-05 only the Create was ever sent
  (roadmap: "ActivityPub Delete not propagating for deleted footnotes").
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.{ActivityBuilder, CommentFederation, RemoteEntry}
  alias Inkwell.Federation.Workers.{CommentFederationWorker, DeliverActivityWorker, FanOutWorker}
  alias Inkwell.Journals.{Comment, Entry}
  alias Inkwell.Social.Relationship
  alias Inkwell.Repo

  defp manual(fun), do: Oban.Testing.with_testing_mode(:manual, fun)

  # A fediverse account on its own server.
  defp actor(server) do
    n = System.unique_integer([:positive])

    create_remote_actor(%{
      ap_id: "https://#{server}/users/u#{n}",
      username: "u#{n}",
      domain: server,
      inbox: "https://#{server}/users/u#{n}/inbox",
      shared_inbox: "https://#{server}/inbox"
    })
  end

  defp followed_from(user, server) do
    a = actor(server)
    Repo.insert!(%Relationship{remote_actor_id: a.id, following_id: user.id, status: :accepted})
    a
  end

  defp entry(user, privacy \\ "public") do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", %{title: "Blitz #{System.unique_integer([:positive])}", body_html: "<p>a heavy watch #{System.unique_integer([:positive])}</p>", privacy: privacy})
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp footnote(user, entry_id, body \\ "<p>sorry to hear that</p>", parent_id \\ nil) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries/#{entry_id}/comments", %{body_html: body, parent_comment_id: parent_id})
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  # Runs the queued footnote Deletes; returns {activity, inbox, signer} for
  # every delivery of the given activity type.
  defp sent(type) do
    for job <- all_enqueued(worker: CommentFederationWorker) do
      perform_job(CommentFederationWorker, job.args)
      Repo.delete!(job)
    end

    for job <- all_enqueued(worker: DeliverActivityWorker), job.args["activity"]["type"] == type do
      {job.args["activity"], job.args["inbox_url"], job.args["user_id"]}
    end
  end

  defp inboxes(deliveries), do: deliveries |> Enum.map(&elem(&1, 1)) |> Enum.sort()
  defp note_url(id), do: ActivityBuilder.comment_ap_url(%{id: id})

  describe "deleting a footnote" do
    test "sends a Delete, signed as its writer, to everyone who got it" do
      manual(fn ->
        alice = create_user()
        bob = create_user()
        followed_from(alice, "a.example")
        followed_from(bob, "b.example")
        id = footnote(bob, entry(alice))

        build_conn() |> log_in_user(bob) |> delete("/api/comments/#{id}") |> response(204)

        deliveries = sent("Delete")
        assert inboxes(deliveries) == ["https://a.example/inbox", "https://b.example/inbox"]

        for {activity, _inbox, signer} <- deliveries do
          assert activity["object"]["id"] == note_url(id)
          assert activity["object"]["type"] == "Tombstone"
          assert activity["actor"] == ActivityBuilder.actor_url(bob)
          assert signer == bob.id
        end
      end)
    end

    test "by an admin is still signed as the writer" do
      manual(fn ->
        alice = create_user()
        bob = create_user()
        admin = create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()
        followed_from(alice, "a.example")
        id = footnote(bob, entry(alice))

        build_conn() |> log_in_user(admin) |> delete("/api/comments/#{id}") |> response(204)

        assert [{activity, _, signer}] = sent("Delete")
        assert activity["actor"] == ActivityBuilder.actor_url(bob)
        assert signer == bob.id
      end)
    end

    test "on a private entry sends nothing (the fediverse never saw it)" do
      manual(fn ->
        alice = create_user()
        followed_from(alice, "a.example")
        id = footnote(alice, entry(alice, "private"))

        build_conn() |> log_in_user(alice) |> delete("/api/comments/#{id}") |> response(204)

        assert sent("Delete") == []
      end)
    end

    test "on a fediverse post goes to the post author's server and the commenter answered" do
      manual(fn ->
        author = actor("post.example")
        answered = actor("reply.example")
        bob = create_user()

        post =
          Repo.insert!(%RemoteEntry{
            ap_id: "https://post.example/statuses/1",
            url: "https://post.example/@x/1",
            body_html: "<p>a post</p>",
            remote_actor_id: author.id,
            published_at: DateTime.utc_now()
          })

        parent =
          Repo.insert!(%Comment{
            remote_entry_id: post.id,
            body_html: "<p>hi</p>",
            ap_id: "https://reply.example/statuses/2",
            remote_author: %{"ap_id" => answered.ap_id, "username" => answered.username, "domain" => "reply.example"}
          })

        id =
          build_conn()
          |> log_in_user(bob)
          |> post("/api/remote-entries/#{post.id}/comments", %{body_html: "<p>yes</p>", parent_comment_id: parent.id})
          |> json_response(201)
          |> get_in(["data", "id"])

        # The reply itself went to both servers, threaded under the comment.
        assert [{create, _, _}, _] = created = for(j <- all_enqueued(worker: DeliverActivityWorker), do: {j.args["activity"], j.args["inbox_url"], nil})
        assert inboxes(created) == ["https://post.example/inbox", "https://reply.example/inbox"]
        assert create["object"]["inReplyTo"] == parent.ap_id

        build_conn() |> log_in_user(bob) |> delete("/api/comments/#{id}") |> response(204)

        assert inboxes(sent("Delete")) == ["https://post.example/inbox", "https://reply.example/inbox"]
      end)
    end
  end

  describe "editing a footnote" do
    test "sends an Update with the new text under the same id" do
      manual(fn ->
        alice = create_user()
        followed_from(alice, "a.example")
        id = footnote(alice, entry(alice), "<p>teh first</p>")

        build_conn()
        |> log_in_user(alice)
        |> patch("/api/comments/#{id}", %{body_html: "<p>the first</p>"})
        |> json_response(200)

        assert [{update, "https://a.example/inbox", _}] = sent("Update")
        assert update["object"]["id"] == note_url(id)
        assert update["object"]["content"] =~ "the first"
        assert update["object"]["updated"]
        assert update["object"]["published"] == DateTime.to_iso8601(Repo.get!(Comment, id).inserted_at)
        refute update["id"] == "#{note_url(id)}/activity"
      end)
    end
  end

  describe "when the entry goes" do
    test "deleting it sends Deletes for every Inkwell footnote on it" do
      manual(fn ->
        alice = create_user()
        bob = create_user()
        followed_from(alice, "a.example")
        e = entry(alice)
        f1 = footnote(bob, e)
        f2 = footnote(alice, e, "<p>thanks</p>", f1)

        build_conn() |> log_in_user(alice) |> delete("/api/entries/#{e}") |> response(204)

        assert [_] = all_enqueued(worker: FanOutWorker, args: %{"action" => "delete"})
        assert sent("Delete") |> Enum.map(&elem(&1, 0)["object"]["id"]) |> Enum.sort() == Enum.sort([note_url(f1), note_url(f2)])
      end)
    end

    test "bulk deleting does the same" do
      manual(fn ->
        alice = create_user()
        followed_from(alice, "a.example")
        e = entry(alice)
        f = footnote(alice, e)

        build_conn()
        |> log_in_user(alice)
        |> post("/api/me/entries/bulk", %{action: "delete", entry_ids: [e]})
        |> json_response(200)

        refute Repo.get(Entry, e)
        assert [{d, _, _}] = sent("Delete")
        assert d["object"]["id"] == note_url(f)
      end)
    end

    test "making it private takes its footnotes off the fediverse" do
      manual(fn ->
        alice = create_user()
        followed_from(alice, "a.example")
        e = entry(alice)
        f = footnote(alice, e)

        build_conn() |> log_in_user(alice) |> patch("/api/entries/#{e}", %{privacy: "private"}) |> json_response(200)

        assert [{d, _, _}] = sent("Delete")
        assert d["object"]["id"] == note_url(f)
      end)
    end

    test "an admin deleting it tells the fediverse (it used to send nothing)" do
      manual(fn ->
        alice = create_user()
        admin = create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()
        followed_from(alice, "a.example")
        e = entry(alice)
        f = footnote(alice, e)

        build_conn() |> log_in_user(admin) |> delete("/api/admin/entries/#{e}") |> response(204)

        assert [_] = all_enqueued(worker: FanOutWorker, args: %{"action" => "delete"})
        assert [{d, _, _}] = sent("Delete")
        assert d["object"]["id"] == note_url(f)
      end)
    end
  end

  test "a suspended spammer's footnotes on public posts are retracted" do
    manual(fn ->
      alice = create_user()
      spammer = create_user()
      followed_from(alice, "a.example")
      public = footnote(spammer, entry(alice))
      # Written while the entry was public; it's private now.
      private_entry = entry(alice, "private")
      Repo.insert!(%Comment{entry_id: private_entry, user_id: spammer.id, body_html: "<p>buy</p>"})

      CommentFederation.retract_by_author(spammer.id)

      assert [{d, _, _}] = sent("Delete")
      assert d["object"]["id"] == note_url(public)
    end)
  end

  describe "deleting an account" do
    test "sends Delete{Person} to every server that knows them, signed with the departed key" do
      manual(fn ->
        user = create_user()
        followed_from(user, "follower.example")
        followed = actor("followed.example")
        Repo.insert!(%Relationship{follower_id: user.id, remote_actor_id: followed.id, status: :accepted})
        user_ap = ActivityBuilder.actor_url(user)
        pem = user.private_key

        build_conn() |> log_in_user(user) |> delete("/api/me", %{username: user.username}) |> json_response(200)

        jobs = all_enqueued(worker: DeliverActivityWorker)
        assert jobs |> Enum.map(& &1.args["inbox_url"]) |> Enum.sort() == ["https://followed.example/inbox", "https://follower.example/inbox"]

        for job <- jobs do
          assert job.args["activity"]["type"] == "Delete"
          assert job.args["activity"]["object"] == user_ap
          refute Map.has_key?(job.args, "user_id")
          refute job.args["signer"] =~ "PRIVATE KEY"

          assert {:ok, %{"private_key" => ^pem, "key_id" => key_id}} =
                   Phoenix.Token.decrypt(InkwellWeb.Endpoint, "federation signer", job.args["signer"])

          assert key_id == "#{user_ap}#main-key"
        end

        # The account is gone, yet the delivery still runs.
        previous = Application.get_env(:inkwell, :deliver_federation)
        Application.put_env(:inkwell, :deliver_federation, false)
        on_exit(fn -> Application.put_env(:inkwell, :deliver_federation, previous) end)
        assert :ok = perform_job(DeliverActivityWorker, hd(jobs).args)
      end)
    end
  end
end
