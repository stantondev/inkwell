defmodule InkwellWeb.TimelinePagingTest do
  @moduledoc """
  Feed and Explore used to merge the first 40 of each source and cut pages out
  of that, so they ran dry after page 2. These pin that every entry can be
  reached, in order, with nothing skipped or repeated.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Reprints, Timeline}

  defp publish(user, n, opts \\ []) do
    {:ok, e} =
      Journals.create_entry(%{
        user_id: user.id,
        title: Keyword.get(opts, :title, "Entry #{n}"),
        body_html: "<p>#{Keyword.get(opts, :body, "Words for entry #{n}.")}</p>",
        privacy: :public,
        status: :published,
        published_at: DateTime.add(DateTime.utc_now(), -n * 60, :second)
      })

    e
  end

  defp mute(user, words) do
    user |> Ecto.Changeset.change(settings: %{"redacted_words" => words}) |> Inkwell.Repo.update!()
  end

  defp read_all(conn, path) do
    Enum.reduce_while(1..20, [], fn page, acc ->
      body = conn |> get("#{path}&page=#{page}") |> json_response(200)
      ids = acc ++ Enum.map(body["data"], & &1["id"])
      if body["pagination"]["has_more"], do: {:cont, ids}, else: {:halt, ids}
    end)
  end

  describe "Timeline" do
    # A source of integers 1..n, sorted "newest first" as ascending numbers.
    defp source(n), do: fn offset, limit -> Enum.slice(1..n//1, offset, limit) |> Enum.to_list() end

    test "pages through two sources without skipping or repeating" do
      evens = fn offset, limit -> Enum.slice(2..200//2, offset, limit) end
      odds = fn offset, limit -> Enum.slice(1..199//2, offset, limit) end

      all =
        for page <- 1..10 do
          needed = page * 20
          {items, _} = Timeline.page([Timeline.take(evens, fn _ -> true end, needed),
                                      Timeline.take(odds, fn _ -> true end, needed)],
                                     &Enum.sort/1, page, 20)
          items
        end

      assert List.flatten(all) == Enum.to_list(1..200)
    end

    test "a filter that rejects items still fills the page" do
      {items, done} = Timeline.take(source(100), &(rem(&1, 3) != 0), 20)
      assert length(items) >= 20
      refute done
      assert Enum.take(items, 20) == Enum.reject(1..100, &(rem(&1, 3) == 0)) |> Enum.take(20)
    end

    test "has_more is false once every source is used up" do
      src = Timeline.take(source(25), fn _ -> true end, 40)
      assert {items, false} = Timeline.page([src], &Enum.sort/1, 2, 20)
      assert items == Enum.to_list(21..25)
    end
  end

  test "Explore reaches every Inkwell entry, not only the newest 40", %{conn: conn} do
    writer = create_user()
    ids = for n <- 1..55, do: publish(writer, n).id

    seen = read_all(conn, "/api/explore?source=inkwell")
    assert seen == ids
  end

  test "Feed reaches every entry from people you follow", %{conn: conn} do
    reader = create_user()
    writer = create_user()
    create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :accepted})
    ids = for n <- 1..45, do: publish(writer, n).id

    seen = read_all(log_in_user(conn, reader), "/api/feed?source=inkwell")
    assert seen == ids
  end

  test "a muted word doesn't end the feed early", %{conn: conn} do
    reader = create_user() |> mute(["spoilers"])
    writer = create_user()
    create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :accepted})

    ids =
      for n <- 1..30 do
        e = publish(writer, n, body: if(n == 5, do: "Big spoilers ahead", else: "Entry #{n}"))
        if n == 5, do: nil, else: e.id
      end
      |> Enum.reject(&is_nil/1)

    conn = log_in_user(conn, reader)
    first = conn |> get("/api/feed?source=inkwell&page=1") |> json_response(200)
    assert length(first["data"]) == 20
    assert first["pagination"]["has_more"]
    assert read_all(conn, "/api/feed?source=inkwell") == ids
  end

  test "reprints show in the feed with muted words set, once each", %{conn: conn} do
    reader = create_user() |> mute(["nothing-matches"])
    friend = create_user()
    stranger = create_user()
    create_relationship(%{follower_id: reader.id, following_id: friend.id, status: :accepted})

    theirs = publish(stranger, 1)
    friends_own = publish(friend, 2)
    other_friend_reprinter = create_user()
    create_relationship(%{follower_id: reader.id, following_id: other_friend_reprinter.id, status: :accepted})

    {:ok, _} = Reprints.toggle_reprint(friend.id, theirs.id)
    # A reprint of someone you follow: the original is already in the feed.
    {:ok, _} = Reprints.toggle_reprint(other_friend_reprinter.id, friends_own.id)

    data = conn |> log_in_user(reader) |> get("/api/feed") |> json_response(200) |> Map.fetch!("data")
    ids = Enum.map(data, & &1["id"])

    assert Enum.count(ids, &(&1 == friends_own.id)) == 1
    assert [%{"source" => "reprint"}] = Enum.filter(data, &(&1["id"] == theirs.id))
  end

  test "the Feed's last-read mark is stored only as a real timestamp", %{conn: conn} do
    user = create_user()
    conn = log_in_user(conn, user)

    patch(conn, "/api/me", %{settings: %{feed_seen_at: "2026-09-25T12:00:00.123456Z"}})
    assert Inkwell.Repo.reload(user).settings["feed_seen_at"] == "2026-09-25T12:00:00.123456Z"

    patch(conn, "/api/me", %{settings: %{feed_seen_at: "<script>"}})
    refute Map.has_key?(Inkwell.Repo.reload(user).settings, "feed_seen_at")
  end
end
