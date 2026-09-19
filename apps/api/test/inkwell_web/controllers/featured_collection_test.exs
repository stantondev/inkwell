defmodule InkwellWeb.FeaturedCollectionTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp entry(user, attrs \\ %{}) do
    defaults = %{
      user_id: user.id,
      title: "t",
      body_html: "<p>hi</p>",
      status: :published,
      privacy: :public,
      slug: "s-#{System.unique_integer([:positive])}",
      published_at: DateTime.utc_now()
    }

    Repo.insert!(struct(Entry, Map.merge(defaults, attrs)))
  end

  defp days_ago(n), do: DateTime.add(DateTime.utc_now(), -n * 86_400, :second)

  defp featured(conn, user) do
    conn
    |> put_req_header("accept", "application/activity+json")
    |> get("/users/#{user.username}/featured")
    |> json_response(200)
  end

  defp uri(entry), do: Inkwell.Federation.ActivityBuilder.entry_ap_url(entry)

  test "falls back to the latest public entries when nothing is pinned", %{conn: conn} do
    user = create_user()
    old = entry(user, %{published_at: days_ago(10)})
    new = entry(user, %{published_at: days_ago(1)})

    body = featured(conn, user)

    assert body["type"] == "OrderedCollection"
    assert body["orderedItems"] == [uri(new), uri(old)]
    assert body["totalItems"] == 2
  end

  test "items are URI strings, which is what Mastodon accepts", %{conn: conn} do
    user = create_user()
    entry(user)

    assert [item] = featured(conn, user)["orderedItems"]
    assert is_binary(item)
  end

  test "pinned entries come first in pin order, then recent ones fill up to 5", %{conn: conn} do
    user = create_user()
    recent = for n <- 1..6, do: entry(user, %{published_at: days_ago(n)})
    pinned_a = entry(user, %{published_at: days_ago(100)})
    pinned_b = entry(user, %{published_at: days_ago(200)})

    user
    |> Ecto.Changeset.change(pinned_entry_ids: [pinned_b.id, pinned_a.id, "not-a-uuid"])
    |> Repo.update!()

    assert featured(conn, user)["orderedItems"] ==
             [uri(pinned_b), uri(pinned_a)] ++ Enum.map(Enum.take(recent, 3), &uri/1)
  end

  test "never lists drafts, hidden, private or friends-only entries", %{conn: conn} do
    user = create_user()
    entry(user, %{status: :draft, published_at: nil})
    entry(user, %{status: :hidden})
    entry(user, %{privacy: :private})
    entry(user, %{privacy: :friends_only})
    public = entry(user)

    pinned_private = entry(user, %{privacy: :private})

    user
    |> Ecto.Changeset.change(pinned_entry_ids: [pinned_private.id])
    |> Repo.update!()

    assert featured(conn, user)["orderedItems"] == [uri(public)]
  end

  test "quote reprints are only featured when pinned", %{conn: conn} do
    user = create_user()
    original = entry(create_user())
    own = entry(user, %{published_at: days_ago(5)})
    quote = entry(user, %{quoted_entry_id: original.id, published_at: days_ago(1)})

    assert featured(conn, user)["orderedItems"] == [uri(own)]

    user
    |> Ecto.Changeset.change(pinned_entry_ids: [quote.id])
    |> Repo.update!()

    assert featured(conn, user)["orderedItems"] == [uri(quote), uri(own)]
  end

  test "suspended accounts feature nothing", %{conn: conn} do
    user = create_user()
    entry(user)

    user
    |> Ecto.Changeset.change(blocked_at: DateTime.utc_now())
    |> Repo.update!()

    assert featured(conn, user)["orderedItems"] == []
  end

  test "unknown users 404", %{conn: conn} do
    assert conn |> get("/users/nobody_here_#{System.unique_integer([:positive])}/featured") |> response(404)
  end
end
