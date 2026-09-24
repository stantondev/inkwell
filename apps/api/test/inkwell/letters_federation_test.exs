defmodule Inkwell.LettersFederationTest do
  @moduledoc """
  Letters phase 4: letters with fediverse accounts, both ways.

  In: a private mention to one member becomes a letter (connected), a
  request (they take requests, account old enough), or stays the mention
  notification it always was. Out: a member's letter to a fediverse account
  is a Note addressed only to that account.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Letters
  alias Inkwell.Letters.{Conversation, DirectMessage}
  alias Inkwell.Accounts.Notification
  alias Inkwell.Moderation.FediverseBlocks
  alias Inkwell.Federation.Workers.DeliverActivityWorker
  alias InkwellWeb.FederationController

  @public "https://www.w3.org/ns/activitystreams#Public"

  defp old_actor(attrs \\ %{}) do
    published = DateTime.utc_now() |> DateTime.add(-400, :day) |> DateTime.to_iso8601()

    create_remote_actor(
      Map.merge(
        %{raw_data: %{"published" => published, "url" => "https://mastodon.example/@x"}},
        attrs
      )
    )
  end

  defp member_url(user), do: "https://inkwell.test/users/#{user.username}"

  defp follows_member(actor, user),
    do: create_relationship(remote_actor_id: actor.id, following_id: user.id, status: :accepted)

  defp dm(actor, user, attrs \\ %{}) do
    Map.merge(
      %{
        "type" => "Note",
        "id" => "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
        "attributedTo" => actor.ap_id,
        "to" => [member_url(user)],
        "cc" => [],
        "content" =>
          ~s(<p><span class="h-card" translate="no"><a href="#{member_url(user)}" class="u-url mention">@<span>#{user.username}</span></a></span> hello from the fediverse</p>),
        "tag" => [%{"type" => "Mention", "href" => member_url(user)}]
      },
      attrs
    )
  end

  defp deliver(actor, activity_type \\ "Create", object, target \\ nil) do
    FederationController.process_activity_async(
      %{"type" => activity_type, "actor" => actor.ap_id, "object" => object},
      target
    )
  end

  defp letters_in(user),
    do: Enum.map(Letters.list_conversations(user.id, :inbox), fn {c, _, _, _, _} -> c end)

  defp mentions(user),
    do:
      Repo.all(
        from(n in Notification, where: n.user_id == ^user.id and n.type == :fediverse_mention)
      )

  defp outgoing_activities,
    do: all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args)

  describe "coming in" do
    setup do
      %{user: create_user(), actor: old_actor()}
    end

    test "a private mention from someone who follows you is a letter", %{user: user, actor: actor} do
      follows_member(actor, user)
      deliver(actor, dm(actor, user))

      assert [conv] = letters_in(user)
      assert conv.remote_actor_id == actor.id and is_nil(conv.participant_b)
      assert [msg] = Repo.all(from(m in DirectMessage, where: m.conversation_id == ^conv.id))
      assert msg.body == "hello from the fediverse"
      refute msg.body_html =~ "mention"
      assert is_nil(msg.sender_id) and msg.sender_remote_actor_id == actor.id
      assert Letters.count_unread_letters(user.id) == 1
      assert mentions(user) == []
    end

    test "also when you follow them, and via your personal inbox", %{user: user, actor: actor} do
      create_relationship(follower_id: user.id, remote_actor_id: actor.id, status: :accepted)
      deliver(actor, "Create", dm(actor, user), user)
      assert [_] = letters_in(user)
    end

    test "a redelivered note is one letter", %{user: user, actor: actor} do
      follows_member(actor, user)
      note = dm(actor, user)
      deliver(actor, note)
      deliver(actor, note)
      assert Repo.aggregate(DirectMessage, :count) == 1
    end

    test "from a stranger, with requests off: the mention notification, as before", %{
      user: user,
      actor: actor
    } do
      deliver(actor, dm(actor, user))
      assert letters_in(user) == []
      assert Repo.aggregate(Conversation, :count) == 0
      assert [_] = mentions(user)
    end

    test "from a stranger, with requests on: a quiet request", %{user: user, actor: actor} do
      user =
        user |> Ecto.Changeset.change(settings: %{"letters_from" => "anyone"}) |> Repo.update!()

      deliver(actor, dm(actor, user))

      assert letters_in(user) == []
      assert [{conv, _, _, _, view}] = Letters.list_conversations(user.id, :requests)
      assert view.request == :incoming
      assert conv.request_status == "pending" and is_nil(conv.requested_by_id)
      assert mentions(user) == []
    end

    test "a brand-new or dateless account can't send requests", %{user: user} do
      user |> Ecto.Changeset.change(settings: %{"letters_from" => "anyone"}) |> Repo.update!()

      fresh =
        create_remote_actor(%{
          raw_data: %{"published" => DateTime.to_iso8601(DateTime.utc_now())}
        })

      dateless = create_remote_actor()
      deliver(fresh, dm(fresh, user))
      deliver(dateless, dm(dateless, user))

      assert Repo.aggregate(Conversation, :count) == 0
      assert length(mentions(user)) == 2
    end

    test "a declined request drops what follows", %{user: user, actor: actor} do
      user |> Ecto.Changeset.change(settings: %{"letters_from" => "anyone"}) |> Repo.update!()
      deliver(actor, dm(actor, user))
      [{conv, _, _, _, _}] = Letters.list_conversations(user.id, :requests)
      {:ok, _} = Letters.apply_action(conv.id, user.id, "decline")

      deliver(actor, dm(actor, user))
      assert Repo.aggregate(DirectMessage, :count) == 1
      assert mentions(user) == []
    end

    test "public, followers-only and group messages aren't letters", %{user: user, actor: actor} do
      follows_member(actor, user)
      other = create_user()

      deliver(actor, dm(actor, user, %{"to" => [member_url(user)], "cc" => [@public]}))

      deliver(
        actor,
        dm(actor, user, %{"to" => ["#{actor.ap_id}/followers"], "cc" => [member_url(user)]})
      )

      deliver(actor, dm(actor, user, %{"to" => [member_url(user), member_url(other)]}))

      assert Repo.aggregate(DirectMessage, :count) == 0
    end

    test "a note written by someone else isn't a letter", %{user: user, actor: actor} do
      follows_member(actor, user)
      deliver(actor, dm(actor, user, %{"attributedTo" => "https://elsewhere.example/users/eve"}))
      assert Repo.aggregate(DirectMessage, :count) == 0
    end

    test "a private reply to an entry still isn't a letter", %{user: user, actor: actor} do
      follows_member(actor, user)

      {:ok, entry} =
        Inkwell.Journals.create_entry(%{
          "user_id" => user.id,
          "title" => "Entry",
          "body_html" => "<p>hi</p>",
          "privacy" => "public"
        })

      deliver(actor, dm(actor, user, %{"inReplyTo" => entry.ap_id}))
      assert Repo.aggregate(DirectMessage, :count) == 0
      assert [_] = mentions(user)
    end

    test "blocked accounts and servers get nothing through", %{user: user, actor: actor} do
      follows_member(actor, user)
      {:ok, _} = FediverseBlocks.block_remote_actor(user.id, actor.id)
      deliver(actor, dm(actor, user))

      other = old_actor(%{domain: "blocked.example", ap_id: "https://blocked.example/users/x"})
      follows_member(other, user)
      {:ok, _} = FediverseBlocks.block_domain(user.id, "blocked.example")
      deliver(other, dm(other, user))

      assert Repo.aggregate(DirectMessage, :count) == 0
      assert mentions(user) == []
    end

    test "its author can edit and delete it; nobody else can", %{user: user, actor: actor} do
      follows_member(actor, user)
      note = dm(actor, user)
      deliver(actor, note)

      stranger = old_actor()
      deliver(stranger, "Update", %{note | "content" => "<p>hijacked</p>"})
      assert Repo.one!(DirectMessage).body == "hello from the fediverse"

      deliver(actor, "Update", %{note | "content" => "<p>edited</p>"})
      msg = Repo.one!(DirectMessage)
      assert msg.body == "edited" and msg.edited_at

      deliver(stranger, "Delete", %{"id" => note["id"], "type" => "Tombstone"})
      assert Repo.aggregate(DirectMessage, :count) == 1
      deliver(actor, "Delete", %{"id" => note["id"], "type" => "Tombstone"})
      assert Repo.aggregate(DirectMessage, :count) == 0
    end
  end

  describe "going out" do
    setup do
      user = create_user()
      actor = old_actor()
      %{user: user, actor: actor}
    end

    test "a letter to a follower is a Note only they can see", %{user: user, actor: actor} do
      follows_member(actor, user)

      Oban.Testing.with_testing_mode(:manual, fn ->
        deliver(actor, dm(actor, user))
        [conv] = letters_in(user)
        incoming = Repo.one!(DirectMessage)

        assert {:ok, sent} =
                 Letters.send_letter(conv.id, user.id, "hello back", "<p>hello back</p>")

        assert sent.ap_id == "https://inkwell.test/letters/notes/#{sent.id}"

        assert [%{"activity" => a, "inbox_url" => inbox}] = outgoing_activities()
        assert inbox == actor.inbox
        assert a["type"] == "Create"
        note = a["object"]
        assert note["id"] == sent.ap_id
        assert a["to"] == [actor.ap_id] and note["to"] == [actor.ap_id]
        assert a["cc"] == [] and note["cc"] == []
        refute inspect(a) =~ @public
        assert [%{"type" => "Mention", "href" => href}] = note["tag"]
        assert href == actor.ap_id
        assert note["inReplyTo"] == incoming.ap_id
        assert note["content"] =~ "hello back"
        assert note["content"] =~ ~s(class="u-url mention")
      end)
    end

    test "edits go out as Updates", %{user: user, actor: actor} do
      follows_member(actor, user)
      {:ok, conv} = Letters.get_or_create_remote_conversation(user.id, actor.id)

      Oban.Testing.with_testing_mode(:manual, fn ->
        {:ok, sent} = Letters.send_letter(conv.id, user.id, "first")

        {:ok, _} =
          Letters.update_letter(sent.id, user.id, %{body: "second", body_html: "<p>second</p>"})

        assert ["Create", "Update"] =
                 outgoing_activities() |> Enum.map(& &1["activity"]["type"]) |> Enum.sort()
      end)
    end

    test "only to accounts you're connected with", %{user: user, actor: actor} do
      assert {:error, :not_pen_pals} =
               Letters.get_or_create_remote_conversation(user.id, actor.id)

      follows_member(actor, user)
      {:ok, conv} = Letters.get_or_create_remote_conversation(user.id, actor.id)

      # They unfollow: writing stops, as with members.
      Repo.delete_all(Inkwell.Social.Relationship)
      assert {:error, :not_pen_pals} = Letters.send_letter(conv.id, user.id, "still there?")
      refute Letters.thread_view(Repo.preload(conv, :remote_actor), user.id).can_write
    end

    test "not to accounts you blocked", %{user: user, actor: actor} do
      follows_member(actor, user)
      {:ok, conv} = Letters.get_or_create_remote_conversation(user.id, actor.id)
      {:ok, _} = FediverseBlocks.block_remote_actor(user.id, actor.id)

      assert {:error, :blocked} = Letters.send_letter(conv.id, user.id, "hi")
      assert {:error, :blocked} = Letters.get_or_create_remote_conversation(user.id, actor.id)
    end

    test "replying to a request accepts it", %{user: user, actor: actor} do
      user =
        user |> Ecto.Changeset.change(settings: %{"letters_from" => "anyone"}) |> Repo.update!()

      deliver(actor, dm(actor, user))
      [{conv, _, _, _, _}] = Letters.list_conversations(user.id, :requests)

      Oban.Testing.with_testing_mode(:manual, fn ->
        assert {:ok, _} = Letters.send_letter(conv.id, user.id, "welcome")
      end)

      assert Repo.get!(Conversation, conv.id).request_status == "accepted"
      assert [_] = letters_in(user)
    end
  end

  describe "the API" do
    test "opening, reading and searching a conversation with a fediverse account", %{conn: conn} do
      user = create_user()
      actor = old_actor()
      follows_member(actor, user)
      conn = log_in_user(conn, user)

      body =
        conn |> post("/api/conversations", %{remote_actor_id: actor.id}) |> json_response(200)

      assert body["data"]["other_user"]["remote"]
      assert body["data"]["other_user"]["handle"] == "@#{actor.username}@mastodon.example"
      conv_id = body["data"]["id"]

      deliver(actor, dm(actor, user, %{"content" => "<p>a secret word: marmalade</p>"}))

      thread = conn |> get("/api/conversations/#{conv_id}") |> json_response(200)
      assert thread["data"]["can_write"]
      assert [letter] = thread["data"]["messages"]
      refute letter["is_mine"]
      assert letter["sender_username"] == "#{actor.username}@mastodon.example"
      assert letter["sender_profile_url"] == "https://mastodon.example/@x"

      list = conn |> get("/api/conversations") |> json_response(200)
      assert [%{"other_user" => %{"remote" => true}, "unread_count" => 0}] = list["data"]

      hits = conn |> get("/api/conversations/search?q=marmalade") |> json_response(200)
      assert [%{"other_user" => %{"remote" => true}}] = hits["data"]

      # Mark unread works with a sender that isn't a member.
      conn
      |> post("/api/conversations/#{conv_id}/actions", %{action: "unread"})
      |> json_response(200)

      assert Letters.count_unread_letters(user.id) == 1
    end

    test "a stranger's id or a made-up one", %{conn: conn} do
      user = create_user()
      conn = log_in_user(conn, user)

      assert conn
             |> post("/api/conversations", %{remote_actor_id: old_actor().id})
             |> json_response(403)

      assert conn
             |> post("/api/conversations", %{remote_actor_id: Ecto.UUID.generate()})
             |> json_response(404)

      assert conn |> post("/api/conversations", %{remote_actor_id: "nope"}) |> json_response(404)
    end
  end

  test "the email names the account and links to its profile" do
    user = create_user()
    actor = old_actor()
    follows_member(actor, user)
    deliver(actor, dm(actor, user))
    [conv] = letters_in(user)

    assert {:ok, _conv, sender} = Letters.letter_email_context(conv.id, user.id)
    assert sender.username == "#{actor.username}@mastodon.example"
    assert sender.profile_url == "https://mastodon.example/@x"

    assert Repo.get_by(Inkwell.Letters.ConversationRead,
             conversation_id: conv.id,
             user_id: user.id
           ).emailed_at
  end
end
