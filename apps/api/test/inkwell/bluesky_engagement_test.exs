defmodule Inkwell.BlueskyEngagementTest do
  @moduledoc """
  Replies, likes and reposts on an entry shared to Bluesky come back to
  Inkwell (`Inkwell.Bluesky.Engagement`), from a fake public AppView.
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Bluesky.{Account, Engagement, Keys}
  alias Inkwell.Journals.{Comment, Entry}

  @writer_did "did:plc:abcdefghijklmnopqrstuvwx"
  @root "at://#{@writer_did}/app.bsky.feed.post/3root"

  setup do
    user = create_user()

    {:ok, entry} =
      Inkwell.Journals.create_entry(%{
        "user_id" => user.id,
        "title" => "Birds in November",
        "body_html" => "<p>The starlings came back.</p>",
        "privacy" => "public"
      })

    account =
      %Account{}
      |> Account.changeset(%{
        user_id: user.id,
        did: @writer_did,
        handle: "writer.test",
        scope: "atproto transition:generic",
        session: Keys.encrypt(%{"access_token" => "a", "refresh_token" => "r", "dpop_key" => Keys.new_dpop_key()})
      })
      |> Repo.insert!()

    share = %{
      "uri" => @root,
      "url" => "https://bsky.app/profile/writer.test/post/3root",
      "domain" => "bsky.app",
      "posted_at" => DateTime.utc_now() |> DateTime.to_iso8601()
    }

    entry = entry |> Ecto.Changeset.change(crosspost_results: %{account.id => share}) |> Repo.update!()

    Process.put(:counts, {3, 1, 1})
    Req.Test.stub(Inkwell.Bluesky, fn conn -> appview(conn) end)

    %{user: user, entry: entry, account: account}
  end

  defp author(handle, extra \\ %{}),
    do: Map.merge(%{"did" => "did:plc:" <> String.duplicate("q", 24 - String.length(handle)) <> String.replace(handle, ".", ""), "handle" => handle, "displayName" => String.capitalize(handle)}, extra)

  defp post(uri, author, text, created, extra \\ %{}) do
    Map.merge(
      %{
        "uri" => uri,
        "author" => author,
        "record" => %{"text" => text, "createdAt" => created}
      },
      extra
    )
  end

  defp appview(conn) do
    {likes, reposts, quotes} = Process.get(:counts)

    thread = %{
      "post" => %{"uri" => @root, "likeCount" => likes, "repostCount" => reposts, "quoteCount" => quotes, "replyCount" => 5},
      "replies" => [
        %{
          "post" => post("at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/app.bsky.feed.post/r1", author("bob.test"), "Lovely 🐦 see https://example.com", "2026-11-03T10:00:00Z",
            %{"record" => %{"text" => "Lovely 🐦 see example.com", "createdAt" => "2026-11-03T10:00:00Z",
              "facets" => [%{"index" => %{"byteStart" => 16, "byteEnd" => 27}, "features" => [%{"$type" => "app.bsky.richtext.facet#link", "uri" => "https://example.com"}]}]}}),
          "replies" => [
            %{"post" => post("at://#{@writer_did}/app.bsky.feed.post/r2", %{"did" => @writer_did, "handle" => "writer.test"}, "Thank you!", "2026-11-03T10:05:00Z")}
          ]
        },
        %{"post" => post("at://did:plc:cccccccccccccccccccccccc/app.bsky.feed.post/r3", author("carol.test"), "Hidden one", "2026-11-03T10:01:00Z")},
        %{"post" => post("at://did:plc:dddddddddddddddddddddddd/app.bsky.feed.post/r4",
            author("dave.test", %{"labels" => [%{"val" => "!no-unauthenticated"}]}), "Keep me off the web", "2026-11-03T10:02:00Z")},
        %{"$type" => "app.bsky.feed.defs#notFoundPost", "uri" => "at://gone"}
      ]
    }

    case conn.request_path do
      "/xrpc/app.bsky.feed.getPostThread" ->
        Req.Test.json(conn, %{
          "thread" => thread,
          "threadgate" => %{"record" => %{"hiddenReplies" => ["at://did:plc:cccccccccccccccccccccccc/app.bsky.feed.post/r3"]}}
        })

      _ ->
        Plug.Conn.send_resp(conn, 404, "")
    end
  end

  defp footnotes(entry), do: Repo.all(from c in Comment, where: c.entry_id == ^entry.id, order_by: c.inserted_at)

  test "replies come back as threaded footnotes; hidden and opted-out ones don't", %{entry: entry, user: user} do
    Engagement.refresh(entry.id)

    [bob, own] = footnotes(entry)

    assert bob.remote_author["source"] == "bluesky"
    assert bob.remote_author["username"] == "bob.test"
    assert bob.remote_author["profile_url"] == "https://bsky.app/profile/bob.test"
    assert bob.url == "https://bsky.app/profile/bob.test/post/r1"
    assert bob.body_html =~ ~s(href="https://example.com")
    assert bob.body_html =~ "nofollow ugc"
    assert bob.body_html =~ "Lovely 🐦"
    assert DateTime.to_date(bob.inserted_at) == ~D[2026-11-03]

    # The writer's own reply on Bluesky is their footnote, under Bob's.
    assert own.user_id == user.id
    assert own.parent_comment_id == bob.id
    assert is_nil(own.remote_author)

    # One notification: Bob's reply (not the writer's own).
    notes = Repo.all(from n in Inkwell.Accounts.Notification, where: n.user_id == ^user.id and n.type == :comment)
    assert [%{data: %{"remote_actor" => %{"source" => "bluesky", "username" => "bob.test"}}}] = notes

    # Looking again adds nothing twice.
    Engagement.refresh(entry.id, force: true)
    assert length(footnotes(entry)) == 2
  end

  test "likes become inks and reposts + quotes become reprints, by the change since last time", %{entry: entry, account: account} do
    Engagement.refresh(entry.id)
    entry2 = Repo.get!(Entry, entry.id)
    assert entry2.ink_count == entry.ink_count + 3
    assert entry2.reprint_count == entry.reprint_count + 2
    assert entry2.crosspost_results[account.id]["likes"] == 3
    assert entry2.crosspost_results[account.id]["checked_at"]

    # Someone unliked, two more reposted.
    Process.put(:counts, {2, 3, 1})
    Engagement.refresh(entry.id, force: true)
    entry3 = Repo.get!(Entry, entry.id)
    assert entry3.ink_count == entry.ink_count + 2
    assert entry3.reprint_count == entry.reprint_count + 4
  end

  test "a share is looked at again sooner while it's new" do
    now = DateTime.utc_now()
    iso = &DateTime.to_iso8601/1
    fresh = %{"posted_at" => iso.(DateTime.add(now, -600)), "checked_at" => iso.(DateTime.add(now, -400))}
    week = %{"posted_at" => iso.(DateTime.add(now, -3 * 86_400)), "checked_at" => iso.(DateTime.add(now, -1800))}

    assert Engagement.stale?(fresh, now)
    refute Engagement.stale?(week, now)
    assert Engagement.stale?(Map.delete(week, "checked_at"), now)
  end

  test "opening the footnotes checks Bluesky", %{entry: entry} do
    body = build_conn() |> get("/api/entries/#{entry.id}/comments") |> json_response(200)
    # The look runs in the background (inline in tests), so the reply is
    # there on the next load.
    assert body["data"] == [] or is_list(body["data"])

    data = (build_conn() |> get("/api/entries/#{entry.id}/comments") |> json_response(200))["data"]
    bob = Enum.find(data, &(&1["remote_author"] && &1["remote_author"]["username"] == "bob.test"))
    assert bob["remote_author"]["source"] == "bluesky"
  end

  test "mentions, links and tags keep their places after emoji" do
    text = "🌿 hi @bob.test see #birds"
    mention = :binary.match(text, "@bob.test")
    tag = :binary.match(text, "#birds")

    html =
      Engagement.body_html(%{
        "record" => %{
          "text" => text,
          "facets" => [
            %{"index" => %{"byteStart" => elem(mention, 0), "byteEnd" => elem(mention, 0) + elem(mention, 1)},
              "features" => [%{"$type" => "app.bsky.richtext.facet#mention", "did" => "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb"}]},
            %{"index" => %{"byteStart" => elem(tag, 0), "byteEnd" => elem(tag, 0) + elem(tag, 1)},
              "features" => [%{"$type" => "app.bsky.richtext.facet#tag", "tag" => "birds"}]}
          ]
        }
      })

    assert html =~ ~s(href="https://bsky.app/profile/did:plc:bbbbbbbbbbbbbbbbbbbbbbbb")
    assert html =~ ">@bob.test</a>"
    assert html =~ ">#birds</a>"
    assert html =~ "🌿 hi"
  end
end
