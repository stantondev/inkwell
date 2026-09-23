defmodule InkwellWeb.LettersTest do
  @moduledoc """
  Letters: who can write, what each person sees, and the endpoints the open
  thread relies on.

  Until Sept 2026 the thread's 5-second check for new letters hit the wrong
  controller clause and got the whole thread back, so new letters never
  appeared until a reload. Several tests below pin the fixes from that audit.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Letters
  alias Inkwell.Letters.DirectMessage
  alias Inkwell.Social

  defp pen_pals(a, b) do
    create_relationship(follower_id: a.id, following_id: b.id, status: :accepted, is_mutual: true)
    create_relationship(follower_id: b.id, following_id: a.id, status: :accepted, is_mutual: true)
  end

  defp conversation(a, b) do
    {:ok, conv} = Letters.get_or_create_conversation(a.id, b.username)
    conv
  end

  defp letter(conv, sender, body \\ "Dear friend") do
    {:ok, msg} = Letters.send_letter(conv.id, sender.id, body)
    msg
  end

  # Letters written in one test run land within microseconds of each other;
  # spread them out so ordering is unambiguous.
  defp backdate(msg, seconds_ago) do
    at = DateTime.add(DateTime.utc_now(), -seconds_ago, :second)
    Repo.update_all(from(m in DirectMessage, where: m.id == ^msg.id), set: [inserted_at: at])
  end

  setup do
    alice = create_user(username: "alice_#{System.unique_integer([:positive])}")
    bob = create_user(username: "bob_#{System.unique_integer([:positive])}")
    pen_pals(alice, bob)
    %{alice: alice, bob: bob, conv: conversation(alice, bob)}
  end

  describe "picking up new letters in an open thread" do
    test "?since returns only the letters after it, as a list", %{conn: conn, alice: alice, bob: bob, conv: conv} do
      first = letter(conv, alice, "first")
      backdate(first, 60)
      second = letter(conv, bob, "second")

      body =
        conn
        |> log_in_user(alice)
        |> get("/api/conversations/#{conv.id}?since=#{first.id}")
        |> json_response(200)

      assert [%{"id" => id, "body" => "second"}] = body["data"]
      assert id == second.id
    end

    test "a malformed cursor or conversation id is a 404, not a crash", %{conn: conn, alice: alice, conv: conv} do
      authed = log_in_user(conn, alice)
      assert authed |> get("/api/conversations/#{conv.id}?since=not-a-uuid") |> json_response(404)
      assert authed |> get("/api/conversations/not-a-uuid") |> json_response(404)
      assert authed |> get("/api/conversations/#{conv.id}?before=nope") |> json_response(404)
    end

    test "a letter id from another conversation can't be used as the cursor",
         %{conn: conn, alice: alice, bob: bob, conv: conv} do
      carol = create_user()
      pen_pals(alice, carol)
      other = letter(conversation(alice, carol), carol)
      letter(conv, bob)

      assert conn
             |> log_in_user(alice)
             |> get("/api/conversations/#{conv.id}?since=#{other.id}")
             |> json_response(404)
    end
  end

  describe "reading back" do
    test "older letters page by cursor", %{conn: conn, alice: alice, bob: bob, conv: conv} do
      for n <- 1..55 do
        conv |> letter(if(rem(n, 2) == 0, do: alice, else: bob), "letter #{n}") |> backdate(1000 - n)
      end

      authed = log_in_user(conn, alice)
      newest = authed |> get("/api/conversations/#{conv.id}") |> json_response(200)
      assert length(newest["data"]["messages"]) == 50
      assert newest["data"]["has_more"]
      assert hd(newest["data"]["messages"])["body"] == "letter 6"
      assert List.last(newest["data"]["messages"])["body"] == "letter 55"

      oldest_loaded = hd(newest["data"]["messages"])["id"]
      older = authed |> get("/api/conversations/#{conv.id}?before=#{oldest_loaded}") |> json_response(200)
      assert Enum.map(older["data"]["messages"], & &1["body"]) == Enum.map(1..5, &"letter #{&1}")
      refute older["data"]["has_more"]
    end
  end

  describe "the Letterbox" do
    test "an empty conversation isn't listed", %{alice: alice, bob: bob} do
      assert Letters.list_conversations(alice.id) == []
      assert Letters.list_conversations(bob.id) == []
    end

    test "unread counts, in one place and in the badge", %{alice: alice, bob: bob, conv: conv} do
      letter(conv, bob, "one")
      letter(conv, bob, "two")

      assert [{_, other, last, 2}] = Letters.list_conversations(alice.id)
      assert other.id == bob.id
      assert last.body == "two"
      assert Letters.count_unread_letters(alice.id) == 1
      assert Letters.count_unread_letters(bob.id) == 0

      Letters.mark_read(conv.id, alice.id)
      assert Letters.count_unread_letters(alice.id) == 0
      assert [{_, _, _, 0}] = Letters.list_conversations(alice.id)
    end

    test "a letter its sender removed disappears for them only", %{alice: alice, bob: bob, conv: conv} do
      kept = letter(conv, alice, "kept")
      backdate(kept, 60)
      removed = letter(conv, alice, "removed")
      {:ok, _} = Letters.delete_letter(removed.id, alice.id)

      assert [{_, _, %{body: "kept"}, _}] = Letters.list_conversations(alice.id)
      assert [{_, _, %{body: "removed"}, 2}] = Letters.list_conversations(bob.id)
    end

    test "avatars are links, never the stored image", %{conn: conn, alice: alice, bob: bob, conv: conv} do
      bob
      |> Ecto.Changeset.change(avatar_url: "data:image/png;base64,iVBORw0KGgo=")
      |> Repo.update!()

      letter(conv, bob)
      authed = log_in_user(conn, alice)

      [row] = authed |> get("/api/conversations") |> json_response(200) |> Map.get("data")
      assert String.starts_with?(row["other_user"]["avatar_url"], "/api/avatars/")

      thread = authed |> get("/api/conversations/#{conv.id}") |> json_response(200)
      assert String.starts_with?(thread["data"]["other_user"]["avatar_url"], "/api/avatars/")
      refute Jason.encode!(thread) =~ "data:image"
    end
  end

  describe "who can write" do
    test "pen pals can", %{alice: alice, conv: conv} do
      assert {:ok, _} = Letters.send_letter(conv.id, alice.id, "hi")
    end

    test "after both unfollow, the old conversation is closed to new letters", %{conn: conn, alice: alice, bob: bob, conv: conv} do
      letter(conv, alice)
      Repo.delete_all(from r in Inkwell.Social.Relationship, where: r.follower_id in [^alice.id, ^bob.id])

      assert {:error, :not_pen_pals} = Letters.send_letter(conv.id, bob.id, "still here?")

      assert conn
             |> log_in_user(bob)
             |> post("/api/conversations/#{conv.id}/letters", %{body: "hello?"})
             |> json_response(403)
    end

    test "a follow in either direction keeps it open", %{alice: alice, bob: bob, conv: conv} do
      Repo.delete_all(from r in Inkwell.Social.Relationship, where: r.follower_id == ^alice.id)
      assert {:ok, _} = Letters.send_letter(conv.id, alice.id, "one-way is fine")
      assert {:ok, _} = Letters.send_letter(conv.id, bob.id, "both ways")
    end

    test "a block stops letters and edits both ways", %{alice: alice, bob: bob, conv: conv} do
      earlier = letter(conv, bob)
      {:ok, _} = Social.block(alice.id, bob.id)

      assert {:error, :blocked} = Letters.send_letter(conv.id, bob.id, "let me in")
      assert {:error, :blocked} = Letters.send_letter(conv.id, alice.id, "no")
      assert {:error, :blocked} = Letters.update_letter(earlier.id, bob.id, %{body: "rewritten"})
    end

    test "you can't open a conversation with a suspended account", %{alice: alice} do
      gone = create_user()
      pen_pals(alice, gone)
      gone |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

      assert {:error, :not_found} = Letters.get_or_create_conversation(alice.id, gone.username)
    end

    test "strangers can't read, poll, write or mark read", %{conn: conn, bob: bob, conv: conv} do
      stranger = create_user()
      msg = letter(conv, bob)
      authed = log_in_user(conn, stranger)

      assert authed |> get("/api/conversations/#{conv.id}") |> json_response(404)
      assert authed |> get("/api/conversations/#{conv.id}?since=#{msg.id}") |> json_response(404)
      assert authed |> post("/api/conversations/#{conv.id}/read") |> json_response(404)
      assert authed |> post("/api/conversations/#{conv.id}/letters", %{body: "hi"}) |> json_response(404)
    end
  end

  describe "editing and removing" do
    test "only your own letters", %{alice: alice, bob: bob, conv: conv} do
      msg = letter(conv, bob)
      assert {:error, :forbidden} = Letters.update_letter(msg.id, alice.id, %{body: "x"})
      assert {:error, :forbidden} = Letters.delete_letter(msg.id, alice.id)
    end

    test "not once you've removed it", %{alice: alice, conv: conv} do
      msg = letter(conv, alice)
      {:ok, _} = Letters.delete_letter(msg.id, alice.id)
      assert {:error, :not_found} = Letters.update_letter(msg.id, alice.id, %{body: "back"})
    end

    test "letter HTML has a size cap", %{alice: alice, conv: conv} do
      huge = "<p>" <> String.duplicate("a", 200_001) <> "</p>"
      assert {:error, %Ecto.Changeset{}} = Letters.send_letter(conv.id, alice.id, "short", huge)
    end
  end
end
