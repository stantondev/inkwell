defmodule InkwellWeb.StampsTest do
  @moduledoc """
  Stamps as postage a reader sends a writer: notes only the writer reads,
  marks on the post for everyone, the album, the new sheets (Keepsakes for
  Plus, retired designs refused), and emoji reactions from the fediverse
  arriving as stamps from abroad.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo, Stamps}
  alias Inkwell.Federation.{ActivityBuilder, StampReactions}
  alias Inkwell.Accounts.Notification
  import Ecto.Query

  defp publish(user, attrs \\ %{}) do
    {:ok, e} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{System.unique_integer([:positive])}",
            body_html: "<p>Some words here.</p>",
            privacy: :public,
            status: :published,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )

    e
  end

  defp stamp(conn, entry, body) do
    conn |> post("/api/entries/#{entry.id}/stamp", Jason.encode!(body))
  end

  setup do
    writer = create_user()
    reader = create_user()
    entry = publish(writer)
    %{writer: writer, reader: reader, entry: entry}
  end

  test "a stamp with a note: marks for everyone, the note only for the writer", %{writer: w, reader: r, entry: e} do
    res =
      build_conn()
      |> log_in_user(r)
      |> stamp(e, %{stamp_type: "felt", note: "  This one   stayed with me  "})
      |> json_response(200)

    assert res["data"]["stamp_type"] == "felt"
    assert res["data"]["note"] == "This one stayed with me"
    assert res["data"]["stamps"] == ["felt"]
    assert res["data"]["stamp_count"] == 1
    assert [%{"type" => "felt", "stamped_on" => _}] = res["data"]["stamp_marks"]
    assert res["data"]["my_stamped_on"]

    # A stranger sees the mark but not the sender or note.
    pub = build_conn() |> get("/api/entries/#{e.id}/stamps") |> json_response(200)
    assert [%{"type" => "felt"} = mark] = pub["data"]["stamp_marks"]
    refute Map.has_key?(mark, "sender")
    refute Map.has_key?(pub["data"], "letters")

    # The writer sees who and the note.
    mine = build_conn() |> log_in_user(w) |> get("/api/entries/#{e.id}/stamps") |> json_response(200)
    assert [%{"note" => "This one stayed with me", "sender" => %{"username" => uname}}] = mine["data"]["letters"]
    assert uname == r.username

    # One notification, carrying the stamp and note.
    n = Repo.one!(from(n in Notification, where: n.user_id == ^w.id and n.type == :stamp))
    assert n.data["note"] || n.data[:note]
  end

  test "changing the design or note sends no second notification; a missing note key keeps the note",
       %{writer: w, reader: r, entry: e} do
    conn = build_conn() |> log_in_user(r)
    stamp(conn, e, %{stamp_type: "felt", note: "hello"}) |> json_response(200)
    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "rooting"}) |> json_response(200)
    assert res["data"]["note"] == "hello"
    assert res["data"]["stamps"] == ["rooting"]

    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "rooting", note: ""}) |> json_response(200)
    assert res["data"]["note"] == nil

    assert Repo.aggregate(from(n in Notification, where: n.user_id == ^w.id and n.type == :stamp), :count) == 1
  end

  test "taking a stamp back", %{reader: r, entry: e} do
    build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "thank_you"}) |> json_response(200)
    res = build_conn() |> log_in_user(r) |> delete("/api/entries/#{e.id}/stamp") |> json_response(200)
    assert res["data"]["stamps"] == []
    assert res["data"]["stamp_marks"] == []
    assert res["data"]["my_stamp"] == nil
  end

  test "notes longer than 140 characters are refused", %{reader: r, entry: e} do
    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "felt", note: String.duplicate("a", 141)})
    assert json_response(res, 422)["error"] =~ "140"
  end

  test "retired designs and unknown ones are refused; First Class is free", %{reader: r, entry: e} do
    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "throwback"})
    assert json_response(res, 400)["code"] == "retired"

    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "nope"})
    assert json_response(res, 400)

    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "first_class"})
    assert json_response(res, 200)["data"]["stamp_type"] == "first_class"

    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "autumn_2026"})
    assert json_response(res, 200)["data"]["stamp_type"] == "autumn_2026"

    # Free for everyone, like every issue.
    res = build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "halloween_2026"})
    assert json_response(res, 200)["data"]["stamp_type"] == "halloween_2026"
  end

  test "Keepsakes are for Plus members", %{entry: e} do
    free = create_user()
    res = build_conn() |> log_in_user(free) |> stamp(e, %{stamp_type: "wax_seal"})
    assert json_response(res, 403)["code"] == "plus_required"

    plus = create_user()
    plus |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active") |> Repo.update!()
    res = build_conn() |> log_in_user(plus) |> stamp(e, %{stamp_type: "wax_seal"})
    assert json_response(res, 200)["data"]["stamp_type"] == "wax_seal"
  end

  test "an entry the reader can't see can't be stamped or inspected", %{writer: w, reader: r} do
    private = publish(w, %{privacy: :private})
    res = build_conn() |> log_in_user(r) |> stamp(private, %{stamp_type: "felt"})
    assert json_response(res, 404)

    res = build_conn() |> log_in_user(r) |> get("/api/entries/#{private.id}/stamps")
    assert json_response(res, 404)

    res = build_conn() |> log_in_user(r) |> post("/api/entries/not-a-uuid/stamp", Jason.encode!(%{stamp_type: "felt"}))
    assert json_response(res, 404)
  end

  test "you can't stamp your own entry", %{writer: w, entry: e} do
    res = build_conn() |> log_in_user(w) |> stamp(e, %{stamp_type: "felt"})
    assert json_response(res, 403)
  end

  test "the album: received and sent, filtered by design", %{writer: w, reader: r, entry: e} do
    other = create_user()
    e2 = publish(w)
    build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "felt", note: "one"}) |> json_response(200)
    build_conn() |> log_in_user(other) |> stamp(e, %{stamp_type: "rooting"}) |> json_response(200)
    build_conn() |> log_in_user(r) |> stamp(e2, %{stamp_type: "felt"}) |> json_response(200)

    got = build_conn() |> log_in_user(w) |> get("/api/me/stamps") |> json_response(200)
    assert got["meta"]["total"] == 3
    assert got["meta"]["types"] == %{"felt" => 2, "rooting" => 1}
    assert Enum.all?(got["data"], &(&1["entry"]["username"] == w.username))

    felt = build_conn() |> log_in_user(w) |> get("/api/me/stamps?type=felt") |> json_response(200)
    assert felt["meta"]["total"] == 2

    sent = build_conn() |> log_in_user(r) |> get("/api/me/stamps?box=sent") |> json_response(200)
    assert sent["meta"]["total"] == 2
    assert Enum.all?(sent["data"], &(&1["recipient"]["username"] == w.username))

    # Someone the writer has blocked drops out of their album.
    Inkwell.Social.block(w.id, other.id)
    got = build_conn() |> log_in_user(w) |> get("/api/me/stamps") |> json_response(200)
    assert got["meta"]["total"] == 2
  end

  test "feed and profile listings carry marks and counts", %{writer: w, reader: r, entry: e} do
    build_conn() |> log_in_user(r) |> stamp(e, %{stamp_type: "felt"}) |> json_response(200)
    s = Stamps.summaries([e.id])
    assert Stamps.count(s, e.id) == 1
    assert [%{type: "felt"}] = Stamps.marks(s, e.id)

    list = build_conn() |> get("/api/users/#{w.username}/entries") |> json_response(200)
    item = Enum.find(list["data"], &(&1["id"] == e.id))
    assert item["stamp_count"] == 1
    assert [%{"type" => "felt"}] = item["stamp_marks"]
  end

  describe "fediverse" do
    test "outbound Likes carry the stamp as a custom emoji, with an id per design" do
      user = create_user()
      like = ActivityBuilder.build_like("https://example.social/notes/1", user, "https://example.social/users/a", "felt")
      assert like["content"] == ":inkwell_felt:"
      assert like["_misskey_reaction"] == ":inkwell_felt:"
      assert [%{"type" => "Emoji", "name" => ":inkwell_felt:", "icon" => %{"url" => url}}] = like["tag"]
      assert url =~ "/api/stamps/felt.png"
      assert like["id"] =~ "-felt"

      undo = ActivityBuilder.build_undo_like("https://example.social/notes/1", user, "https://example.social/users/a", "felt")
      assert undo["object"]["id"] == like["id"]
    end

    test "reading reactions" do
      assert :plain = StampReactions.parse(%{"type" => "Like"})
      assert :plain = StampReactions.parse(%{"type" => "Like", "content" => "❤"})
      assert {:stamp, %{stamp_type: "abroad", emoji: "🎉"}} = StampReactions.parse(%{"type" => "Like", "content" => "🎉"})
      assert {:stamp, %{stamp_type: "abroad", emoji: "❤"}} = StampReactions.parse(%{"type" => "EmojiReact", "content" => "❤"})
      assert :plain = StampReactions.parse(%{"type" => "Like", "content" => "hello there"})

      assert {:stamp, %{stamp_type: "felt"}} =
               StampReactions.parse(%{"type" => "Like", "_misskey_reaction" => ":inkwell_felt:"})

      custom = %{
        "type" => "EmojiReact",
        "content" => ":blobcat:",
        "tag" => [%{"type" => "Emoji", "name" => ":blobcat:", "icon" => %{"url" => "https://x.example/blobcat.png"}}]
      }

      assert {:stamp, %{stamp_type: "abroad", emoji: ":blobcat:", emoji_url: "https://x.example/blobcat.png"}} =
               StampReactions.parse(custom)

      insecure = put_in(custom, ["tag"], [%{"type" => "Emoji", "name" => ":blobcat:", "icon" => %{"url" => "http://x.example/b.png"}}])
      assert {:stamp, %{emoji_url: nil}} = StampReactions.parse(insecure)
    end

    test "an emoji reaction on an entry becomes a stamp from abroad; a redelivery doesn't double; Undo removes it",
         %{writer: w, entry: e} do
      actor = create_remote_actor(%{domain: "misskey.example"})

      react = %{
        "type" => "EmojiReact",
        "id" => "https://misskey.example/likes/1",
        "actor" => actor.ap_id,
        "object" => "https://inkwell.social/entries/#{e.id}",
        "content" => "🎉"
      }

      InkwellWeb.FederationController.process_activity_async(react, w)
      InkwellWeb.FederationController.process_activity_async(react, w)

      s = Stamps.summaries([e.id])
      assert Stamps.count(s, e.id) == 1
      assert [%{type: "abroad", emoji: "🎉", domain: "misskey.example"}] = Stamps.marks(s, e.id)
      assert Repo.aggregate(from(n in Notification, where: n.user_id == ^w.id and n.type == :stamp), :count) == 1

      # Not an ink.
      assert Repo.reload!(e).ink_count == 0

      undo = %{"type" => "Undo", "actor" => actor.ap_id, "object" => react}
      InkwellWeb.FederationController.process_activity_async(undo, w)
      assert Stamps.count(Stamps.summaries([e.id]), e.id) == 0
    end

    test "a plain Like is still an ink", %{writer: w, entry: e} do
      actor = create_remote_actor()

      like = %{
        "type" => "Like",
        "id" => "https://mastodon.example/likes/9",
        "actor" => actor.ap_id,
        "object" => "https://inkwell.social/entries/#{e.id}"
      }

      InkwellWeb.FederationController.process_activity_async(like, w)
      assert Repo.reload!(e).ink_count == 1
      assert Stamps.count(Stamps.summaries([e.id]), e.id) == 0
    end
  end
end
