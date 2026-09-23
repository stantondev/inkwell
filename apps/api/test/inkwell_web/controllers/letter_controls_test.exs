defmodule InkwellWeb.LetterControlsTest do
  @moduledoc """
  Letters phase 3: each person's own archive / mute / mark unread / delete,
  search inside letters, and letter requests from people who aren't pen pals.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Letters
  alias Inkwell.Letters.{Conversation, ConversationRead, DirectMessage}

  defp pen_pals(a, b) do
    create_relationship(follower_id: a.id, following_id: b.id, status: :accepted, is_mutual: true)
    create_relationship(follower_id: b.id, following_id: a.id, status: :accepted, is_mutual: true)
  end

  # Old enough to send letter requests.
  defp seasoned_user(attrs \\ %{}) do
    user = create_user(attrs)
    old = DateTime.add(DateTime.utc_now(), -30, :day)
    Repo.update_all(from(u in Inkwell.Accounts.User, where: u.id == ^user.id), set: [inserted_at: old])
    Repo.get!(Inkwell.Accounts.User, user.id)
  end

  defp takes_requests(user) do
    user |> Ecto.Changeset.change(settings: %{"letters_from" => "anyone"}) |> Repo.update!()
  end

  defp write(conv, from, body \\ "hello") do
    {:ok, m} = Letters.send_letter(conv.id, from.id, body)
    m
  end

  defp folder_ids(user, folder),
    do: user.id |> Letters.list_conversations(folder) |> Enum.map(fn {c, _, _, _, _} -> c.id end)

  describe "your own controls" do
    setup do
      alice = seasoned_user()
      bob = seasoned_user()
      pen_pals(alice, bob)
      {:ok, conv} = Letters.get_or_create_conversation(alice.id, bob.username)
      write(conv, bob, "first")
      %{alice: alice, bob: bob, conv: conv}
    end

    test "archive hides it until a newer letter arrives", %{alice: alice, bob: bob, conv: conv} do
      {:ok, _} = Letters.apply_action(conv.id, alice.id, "archive")
      assert folder_ids(alice, :inbox) == []
      assert folder_ids(alice, :archived) == [conv.id]
      # Bob's view doesn't change.
      assert folder_ids(bob, :inbox) == [conv.id]

      Process.sleep(2)
      write(conv, bob, "are you there?")
      assert folder_ids(alice, :inbox) == [conv.id]
      assert folder_ids(alice, :archived) == []
    end

    test "mute: still unread in the list, but no badge, push or email", %{alice: alice, bob: bob, conv: conv} do
      Letters.mark_read(conv.id, alice.id)
      {:ok, _} = Letters.apply_action(conv.id, alice.id, "mute")
      # The setup's letter was emailed before the mute; nothing new after it.
      emailed_before = Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: alice.id).emailed_at
      Process.sleep(2)
      write(conv, bob, "quiet one")

      assert [{_, _, _, 1, %{muted: true}}] = Letters.list_conversations(alice.id)
      assert Letters.count_unread_letters(alice.id) == 0
      assert Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: alice.id).emailed_at == emailed_before
      refute Letters.letter_email_due?(conv.id, alice.id)

      {:ok, _} = Letters.apply_action(conv.id, alice.id, "unmute")
      assert Letters.count_unread_letters(alice.id) == 1
    end

    test "mark unread", %{alice: alice, conv: conv} do
      Letters.mark_read(conv.id, alice.id)
      assert Letters.count_unread_letters(alice.id) == 0
      {:ok, _} = Letters.apply_action(conv.id, alice.id, "unread")
      assert Letters.count_unread_letters(alice.id) == 1
    end

    test "can't mark unread with nothing from them", %{bob: bob, conv: conv} do
      assert {:error, :invalid} = Letters.apply_action(conv.id, bob.id, "unread")
    end

    test "delete for me clears it for you only; new letters still arrive", %{alice: alice, bob: bob, conv: conv} do
      {:ok, _} = Letters.apply_action(conv.id, alice.id, "delete")

      assert folder_ids(alice, :inbox) == []
      assert {:ok, _, [], false} = Letters.get_conversation(conv.id, alice.id)
      assert {:ok, _, [%{body: "first"}], false} = Letters.get_conversation(conv.id, bob.id)
      assert Letters.search_letters(alice.id, "first") == []
      assert Letters.count_unread_letters(alice.id) == 0

      Process.sleep(2)
      write(conv, bob, "after")
      assert {:ok, _, [%{body: "after"}], false} = Letters.get_conversation(conv.id, alice.id)
    end

    test "over the API, and not for strangers", %{conn: conn, alice: alice, conv: conv} do
      authed = log_in_user(conn, alice)
      assert authed |> post("/api/conversations/#{conv.id}/actions", %{action: "archive"}) |> json_response(200)
      assert authed |> post("/api/conversations/#{conv.id}/actions", %{action: "explode"}) |> json_response(422)

      stranger = log_in_user(build_conn(), create_user())
      assert stranger |> post("/api/conversations/#{conv.id}/actions", %{action: "mute"}) |> json_response(404)
      assert stranger |> post("/api/conversations/not-a-uuid/actions", %{action: "mute"}) |> json_response(404)

      body = authed |> get("/api/conversations?folder=archived") |> json_response(200)
      assert [%{"id" => id}] = body["data"]
      assert id == conv.id
      assert body["meta"]["counts"]["archived"] == 1
    end
  end

  describe "search" do
    setup do
      alice = seasoned_user()
      bob = seasoned_user()
      pen_pals(alice, bob)
      {:ok, conv} = Letters.get_or_create_conversation(alice.id, bob.username)
      %{alice: alice, bob: bob, conv: conv}
    end

    test "finds your letters, not other people's", %{alice: alice, bob: bob, conv: conv} do
      write(conv, bob, "Meet me at the Lighthouse on Sunday")
      carol = seasoned_user()
      dave = seasoned_user()
      pen_pals(carol, dave)
      {:ok, other} = Letters.get_or_create_conversation(carol.id, dave.username)
      write(other, dave, "The lighthouse is closed")

      assert [%{body: "Meet me at the Lighthouse on Sunday"}] = Letters.search_letters(alice.id, "lighthouse")
      assert [%{body: "The lighthouse is closed"}] = Letters.search_letters(carol.id, "lighthouse")
    end

    test "letters you removed don't match", %{alice: alice, conv: conv} do
      m = write(conv, alice, "a secret word")
      {:ok, _} = Letters.delete_letter(m.id, alice.id)
      assert Letters.search_letters(alice.id, "secret") == []
    end

    test "wildcards are just characters", %{alice: alice, bob: bob, conv: conv} do
      write(conv, bob, "plain words")
      assert Letters.search_letters(alice.id, "%%") == []
      assert Letters.search_letters(alice.id, "_") == []
      write(conv, bob, "100% sure")
      assert [%{body: "100% sure"}] = Letters.search_letters(alice.id, "0% s")
    end

    test "over the API", %{conn: conn, alice: alice, bob: bob, conv: conv} do
      write(conv, bob, "the blue notebook")
      [hit] = conn |> log_in_user(alice) |> get("/api/conversations/search?q=notebook") |> json_response(200) |> Map.get("data")
      assert hit["conversation_id"] == conv.id
      assert hit["other_user"]["username"] == bob.username
    end
  end

  describe "letter requests" do
    setup do
      writer = seasoned_user()
      reader = seasoned_user()
      %{writer: writer, reader: reader}
    end

    test "pen pals only by default", %{writer: writer, reader: reader} do
      assert Letters.letter_access(writer, reader) == nil
      assert {:error, :not_pen_pals} = Letters.get_or_create_conversation(writer.id, reader.username)
    end

    test "one letter, into Requests, quietly", %{writer: writer, reader: reader} do
      reader = takes_requests(reader)
      assert Letters.letter_access(writer, reader) == :request

      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      assert conv.request_status == "pending"
      write(conv, writer, "Loved your essay on lighthouses")

      assert {:error, :request_pending} = Letters.send_letter(conv.id, writer.id, "and another thing")
      assert Letters.thread_view(conv, writer.id).request_waiting

      assert folder_ids(reader, :requests) == [conv.id]
      assert folder_ids(reader, :inbox) == []
      assert folder_ids(writer, :inbox) == [conv.id]
      # No email for a request.
      refute Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: reader.id)
    end

    test "accepting opens it both ways", %{writer: writer, reader: reader} do
      takes_requests(reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      write(conv, writer)

      {:ok, _} = Letters.apply_action(conv.id, reader.id, "accept")
      assert folder_ids(reader, :inbox) == [conv.id]
      assert {:ok, _} = Letters.send_letter(conv.id, writer.id, "thank you!")
      assert Letters.letter_access(writer, reader) == :letter
    end

    test "replying accepts it", %{writer: writer, reader: reader} do
      takes_requests(reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      write(conv, writer)
      write(conv, reader, "Hello back")

      assert Repo.get!(Conversation, conv.id).request_status == "accepted"
      assert {:ok, _} = Letters.send_letter(conv.id, writer.id, "now we're talking")
    end

    test "declining is silent and final for the sender", %{writer: writer, reader: reader} do
      takes_requests(reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      write(conv, writer)

      {:ok, _} = Letters.apply_action(conv.id, reader.id, "decline")
      assert folder_ids(reader, :requests) == []
      assert folder_ids(reader, :inbox) == []

      # The sender still just sees their request waiting, and can't add more
      # or start over.
      view = Letters.thread_view(Repo.get!(Conversation, conv.id), writer.id)
      assert view.request_waiting and view.request == :outgoing
      assert {:error, :request_pending} = Letters.send_letter(conv.id, writer.id, "please?")
      assert {:ok, same} = Letters.get_or_create_conversation(writer.id, reader.username)
      assert same.id == conv.id
    end

    test "the sender can't answer their own request", %{writer: writer, reader: reader} do
      takes_requests(reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      assert {:error, :invalid} = Letters.apply_action(conv.id, writer.id, "accept")
    end

    test "new and limited accounts can't send requests", %{reader: reader} do
      reader = takes_requests(reader)
      assert Letters.letter_access(create_user(), reader) == nil

      limited = seasoned_user()
      limited = limited |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
      assert Letters.letter_access(limited, reader) == nil
    end

    test "five new requests a day", %{writer: writer} do
      for _ <- 1..5 do
        target = takes_requests(seasoned_user())
        assert {:ok, _} = Letters.get_or_create_conversation(writer.id, target.username)
      end

      sixth = takes_requests(seasoned_user())
      assert {:error, :request_limit} = Letters.get_or_create_conversation(writer.id, sixth.username)
    end

    test "blocks win", %{writer: writer, reader: reader} do
      reader = takes_requests(reader)
      {:ok, _} = Inkwell.Social.block(reader.id, writer.id)
      assert Letters.letter_access(writer, reader) == nil
    end

    test "former pen pals: the old conversation becomes the request", %{writer: writer, reader: reader} do
      pen_pals(writer, reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      write(conv, writer, "old times")
      Repo.delete_all(from r in Inkwell.Social.Relationship, where: r.follower_id in [^writer.id, ^reader.id])
      takes_requests(reader)

      {:ok, again} = Letters.get_or_create_conversation(writer.id, reader.username)
      assert again.id == conv.id and again.request_status == "pending"
      # The old letters don't use up the request.
      assert {:ok, _} = Letters.send_letter(conv.id, writer.id, "can we pick this up again?")
      assert {:error, :request_pending} = Letters.send_letter(conv.id, writer.id, "hello?")
    end

    test "the profile says what you can send", %{conn: conn, writer: writer, reader: reader} do
      access = fn ->
        conn |> log_in_user(writer) |> get("/api/users/#{reader.username}") |> json_response(200) |> get_in(["meta", "letter_access"])
      end

      assert access.() == nil
      takes_requests(reader)
      assert access.() == "request"
    end

    test "requests aren't counted as ordinary letters anywhere they shouldn't be", %{writer: writer, reader: reader} do
      takes_requests(reader)
      {:ok, conv} = Letters.get_or_create_conversation(writer.id, reader.username)
      write(conv, writer)
      assert Repo.aggregate(from(m in DirectMessage, where: m.conversation_id == ^conv.id), :count) == 1
      assert Letters.folder_counts(reader.id) == %{requests: 1, requests_unread: 1, archived: 0}
    end
  end
end
