defmodule InkwellWeb.ExploreWaitingTest do
  @moduledoc """
  Explore's "Waiting for a reply" (`sort=waiting`): recent entries nobody but
  the writer has written back to, first entries first, then the ones that
  have waited longest. And the "First entry" mark on Explore and Feed cards.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo}

  @words String.duplicate("word ", 40)

  defp publish(user, attrs \\ %{}) do
    n = System.unique_integer([:positive])

    {:ok, e} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{n}",
            body_html: "<p>#{@words}</p>",
            privacy: :public,
            status: :published,
            word_count: 40,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )

    e
  end

  defp published_ago(entry, days) do
    entry
    |> Ecto.Changeset.change(published_at: DateTime.utc_now() |> DateTime.add(-days, :day) |> DateTime.truncate(:microsecond))
    |> Repo.update!()
  end

  defp imported(entry) do
    entry |> Ecto.Changeset.change(imported_from: "livejournal") |> Repo.update!()
  end

  defp comment(entry, user) do
    {:ok, c} = Journals.create_comment(%{"entry_id" => entry.id, "user_id" => user.id, "body_html" => "<p>Lovely.</p>"})
    c
  end

  defp waiting(conn \\ build_conn()) do
    conn
    |> get("/api/explore?sort=waiting&per_page=50")
    |> json_response(200)
    |> Map.fetch!("data")
  end

  defp waiting_ids(conn \\ build_conn()), do: Enum.map(waiting(conn), & &1["id"])

  test "an entry with no replies is waiting; a reply from someone else takes it off" do
    writer = create_user()
    e = publish(writer)
    assert e.id in waiting_ids()

    comment(e, create_user())
    refute e.id in waiting_ids()
  end

  test "the writer's own footnote doesn't count as a reply" do
    writer = create_user()
    e = publish(writer)
    comment(e, writer)
    assert e.id in waiting_ids()
  end

  test "an ink or stamp doesn't take it off the list" do
    e = publish(create_user())
    {:ok, _} = Inkwell.Inks.toggle_ink(create_user().id, e.id)
    assert e.id in waiting_ids()
  end

  test "stickies, very short posts, old posts and imported posts are left out" do
    writer = create_user()
    short = publish(writer, %{body_html: "<p>Just a few words here.</p>", word_count: 5})
    old = writer |> publish() |> published_ago(20)
    imported = writer |> publish() |> imported()

    {:ok, sticky} =
      Journals.create_entry(%{
        user_id: writer.id,
        kind: "sticky",
        body_html: "<p>#{@words}</p>",
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now()
      })

    ids = waiting_ids()
    for e <- [short, old, imported, sticky], do: refute(e.id in ids)
  end

  test "only Inkwell entries, never fediverse posts, and never the viewer's own" do
    me = create_user()
    mine = publish(me)
    theirs = publish(create_user())

    ids = waiting_ids(build_conn() |> log_in_user(me))
    refute mine.id in ids
    assert theirs.id in ids

    assert Enum.all?(waiting(build_conn()), &(&1["source"] == "local"))
  end

  test "first entries come first, then the longest waiting" do
    veteran = create_user()
    _earlier = veteran |> publish() |> published_ago(30)
    long_wait = veteran |> publish() |> published_ago(5)
    recent = veteran |> publish() |> published_ago(1)

    newcomer = create_user()
    first = newcomer |> publish() |> published_ago(0)

    ids = waiting_ids()
    order = Enum.filter(ids, &(&1 in [first.id, long_wait.id, recent.id]))
    assert order == [first.id, long_wait.id, recent.id]
  end

  test "a new account that links out and has never interacted stays off the list" do
    spam = publish(create_user(), %{body_html: ~s(<p>#{@words} <a href="https://seals.example.com">Buy</a></p>)})
    refute spam.id in waiting_ids()
  end

  describe "first entry mark" do
    test "Explore marks a writer's first entry, not their second" do
      writer = create_user()
      first = writer |> publish() |> published_ago(2)
      second = publish(writer)

      data =
        build_conn()
        |> get("/api/explore?source=inkwell&per_page=50")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Map.new(&{&1["id"], &1})

      assert data[first.id]["first_entry"] == true
      assert data[second.id]["first_entry"] == false
    end

    test "stickies and imports before it don't stop an entry being the first" do
      writer = create_user()
      writer |> publish(%{published_at: ~U[2005-01-01 00:00:00.000000Z]}) |> imported()

      {:ok, _} =
        Journals.create_entry(%{
          user_id: writer.id,
          kind: "sticky",
          body_html: "<p>hello</p>",
          privacy: :public,
          status: :published,
          published_at: DateTime.utc_now() |> DateTime.add(-1, :day)
        })

      e = publish(writer)
      assert Journals.first_entry?(Repo.reload!(e))
      assert MapSet.member?(Journals.recent_first_entry_ids([e.id]), e.id)
    end

    test "the Feed marks first entries too" do
      reader = create_user()
      writer = create_user()
      create_relationship(%{follower_id: reader.id, following_id: writer.id, status: :accepted})
      e = publish(writer)

      data =
        build_conn()
        |> log_in_user(reader)
        |> get("/api/feed")
        |> json_response(200)
        |> Map.fetch!("data")

      assert Enum.find(data, &(&1["id"] == e.id))["first_entry"] == true
    end
  end
end
