defmodule InkwellWeb.FediverseCommentThreadTest do
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.{ActivityBuilder, RemoteEntry}
  alias Inkwell.Journals.{Comment, Entry}
  alias Inkwell.Repo

  @public "https://www.w3.org/ns/activitystreams#Public"

  defp remote_entry(actor) do
    n = System.unique_integer([:positive])

    Repo.insert!(%RemoteEntry{
      ap_id: "https://mastodon.example/users/#{actor.username}/statuses/#{n}",
      url: "https://mastodon.example/@#{actor.username}/#{n}",
      body_html: "<p>a post</p>",
      remote_actor_id: actor.id,
      published_at: DateTime.utc_now()
    })
  end

  defp local_comment(attrs) do
    Repo.insert!(struct(Comment, Map.merge(%{body_html: "<p>local</p>", depth: 0}, attrs)))
  end

  defp remote_comment(actor, attrs) do
    Repo.insert!(
      struct(
        Comment,
        Map.merge(
          %{
            body_html: "<p>from mastodon</p>",
            depth: 0,
            ap_id: "https://mastodon.example/users/#{actor.username}/statuses/#{System.unique_integer([:positive])}",
            remote_author: %{
              "ap_id" => actor.ap_id,
              "username" => actor.username,
              "domain" => actor.domain,
              "display_name" => actor.display_name
            }
          },
          attrs
        )
      )
    )
  end

  defp notifications(user, type) do
    Repo.all(from n in Notification, where: n.user_id == ^user.id and n.type == ^type)
  end

  describe "replying on a fediverse post" do
    test "is threaded, and notifies the member being replied to", %{conn: conn} do
      post = remote_entry(create_remote_actor())
      alice = create_user()
      bob = create_user()
      parent = local_comment(%{remote_entry_id: post.id, user_id: alice.id})

      body =
        conn
        |> log_in_user(bob)
        |> post("/api/remote-entries/#{post.id}/comments", %{
          body_html: "<p>agreed</p>",
          parent_comment_id: parent.id
        })
        |> json_response(201)

      reply = Repo.get!(Comment, body["data"]["id"])
      assert reply.parent_comment_id == parent.id

      assert [n] = notifications(alice, :reply)
      assert n.actor_id == bob.id
      assert n.target_type == "remote_entry"
      assert n.target_id == post.id
    end

    test "@mentions notify the people mentioned, once", %{conn: conn} do
      post = remote_entry(create_remote_actor())
      alice = create_user()
      bob = create_user()
      carol = create_user()
      parent = local_comment(%{remote_entry_id: post.id, user_id: alice.id})

      conn
      |> log_in_user(bob)
      |> post("/api/remote-entries/#{post.id}/comments", %{
        body_html: "<p>@#{carol.username} and @#{alice.username} look</p>",
        parent_comment_id: parent.id
      })
      |> json_response(201)

      assert [_] = notifications(carol, :mention)
      # Alice already gets the reply notification.
      assert notifications(alice, :mention) == []
      assert [_] = notifications(alice, :reply)
    end

    test "replying to your own comment notifies nobody", %{conn: conn} do
      post = remote_entry(create_remote_actor())
      alice = create_user()
      parent = local_comment(%{remote_entry_id: post.id, user_id: alice.id})

      conn
      |> log_in_user(alice)
      |> post("/api/remote-entries/#{post.id}/comments", %{body_html: "<p>also</p>", parent_comment_id: parent.id})
      |> json_response(201)

      assert notifications(alice, :reply) == []
    end

    test "a fediverse comment can be replied to", %{conn: conn} do
      actor = create_remote_actor()
      post = remote_entry(actor)
      parent = remote_comment(create_remote_actor(), %{remote_entry_id: post.id})

      body =
        conn
        |> log_in_user(create_user())
        |> post("/api/remote-entries/#{post.id}/comments", %{body_html: "<p>hi</p>", parent_comment_id: parent.id})
        |> json_response(201)

      assert Repo.get!(Comment, body["data"]["id"]).parent_comment_id == parent.id
    end

    test "rejects a parent comment from a different post", %{conn: conn} do
      actor = create_remote_actor()
      post = remote_entry(actor)
      other = remote_entry(actor)
      parent = local_comment(%{remote_entry_id: other.id, user_id: create_user().id})

      conn
      |> log_in_user(create_user())
      |> post("/api/remote-entries/#{post.id}/comments", %{body_html: "<p>x</p>", parent_comment_id: parent.id})
      |> json_response(422)
    end
  end

  describe "thread_reply/2" do
    defp note do
      ActivityBuilder.build_reply_note(
        "<p>hi</p>",
        "https://mastodon.example/users/op/statuses/1",
        create_user(),
        Ecto.UUID.generate(),
        "https://mastodon.example/users/op"
      )
    end

    test "leaves top-level comments pointing at the post" do
      activity = note()
      assert ActivityBuilder.thread_reply(activity, nil) == activity
    end

    test "a reply to a fediverse comment points at it, addresses and mentions its author" do
      actor = create_remote_actor()
      parent = remote_comment(actor, %{remote_entry_id: remote_entry(create_remote_actor()).id})

      activity = ActivityBuilder.thread_reply(note(), parent)
      object = activity["object"]

      assert object["inReplyTo"] == parent.ap_id
      assert actor.ap_id in activity["to"]
      assert actor.ap_id in object["to"]

      assert %{"name" => name} = Enum.find(object["tag"], &(&1["href"] == actor.ap_id))
      assert name == "@#{actor.username}@#{actor.domain}"
      # The post author stays mentioned too.
      assert Enum.any?(object["tag"], &(&1["href"] == "https://mastodon.example/users/op"))
    end

    test "a reply to a comment written on Inkwell points at our comment URL" do
      parent = local_comment(%{remote_entry_id: remote_entry(create_remote_actor()).id, user_id: create_user().id})
      activity = ActivityBuilder.thread_reply(note(), parent)

      assert activity["object"]["inReplyTo"] == "https://inkwell.test/comments/#{parent.id}"
      assert activity["to"] == note()["to"]
    end
  end

  describe "GET /comments/:id" do
    defp public_entry(user, attrs \\ %{}) do
      Repo.insert!(
        struct(
          Entry,
          Map.merge(
            %{
              user_id: user.id,
              title: "t",
              body_html: "<p>hi</p>",
              status: :published,
              privacy: :public,
              slug: "s-#{System.unique_integer([:positive])}",
              published_at: DateTime.utc_now()
            },
            attrs
          )
        )
      )
    end

    defp fetch_ap(conn, id) do
      conn |> put_req_header("accept", "application/activity+json") |> get("/comments/#{id}")
    end

    test "serves a comment on a public entry as a Note", %{conn: conn} do
      author = create_user()
      commenter = create_user()
      entry = public_entry(author)
      comment = local_comment(%{entry_id: entry.id, user_id: commenter.id, body_html: "<p>lovely</p>"})

      note = conn |> fetch_ap(comment.id) |> json_response(200)

      assert note["type"] == "Note"
      assert note["id"] == "https://inkwell.test/comments/#{comment.id}"
      assert note["attributedTo"] == "https://inkwell.test/users/#{commenter.username}"
      assert note["inReplyTo"] == (entry.ap_id || ActivityBuilder.entry_ap_url(entry))
      assert note["content"] =~ "lovely"
      assert @public in note["to"]
      assert note["url"] == "https://inkwell.test/#{author.username}/#{entry.slug}#comments"
    end

    test "a reply points at the fediverse comment it answers", %{conn: conn} do
      post = remote_entry(create_remote_actor())
      parent = remote_comment(create_remote_actor(), %{remote_entry_id: post.id})

      reply =
        local_comment(%{remote_entry_id: post.id, user_id: create_user().id, parent_comment_id: parent.id, depth: 1})

      note = conn |> fetch_ap(reply.id) |> json_response(200)

      assert note["inReplyTo"] == parent.ap_id
      assert note["url"] == "https://inkwell.test/fediverse/#{post.id}#comments"
    end

    test "browsers are sent to the conversation", %{conn: conn} do
      entry = public_entry(create_user())
      comment = local_comment(%{entry_id: entry.id, user_id: create_user().id})

      assert redirected_to(get(conn, "/comments/#{comment.id}"), 302) =~ "#comments"
    end

    test "404s for comments that aren't public or aren't ours", %{conn: conn} do
      private = public_entry(create_user(), %{privacy: :private})
      on_private = local_comment(%{entry_id: private.id, user_id: create_user().id})

      post = remote_entry(create_remote_actor())
      from_fediverse = remote_comment(create_remote_actor(), %{remote_entry_id: post.id})

      suspended = create_user()
      suspended |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()
      by_suspended = local_comment(%{entry_id: public_entry(create_user()).id, user_id: suspended.id})

      for id <- [on_private.id, from_fediverse.id, by_suspended.id, Ecto.UUID.generate(), "nope"] do
        assert build_conn() |> fetch_ap(id) |> json_response(404)
      end
    end
  end
end
