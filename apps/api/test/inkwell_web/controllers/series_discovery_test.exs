defmodule InkwellWeb.SeriesDiscoveryTest do
  @moduledoc """
  Finding a writer's series (@stoicalgeezer, 2026-10-21): the Posts page went
  blank whenever a page of results held an entry in a series (it read
  `series.name`, which doesn't exist), the writer's own journal page never
  said which series an entry was in, and nothing could search for one.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.{Entry, Series}
  alias Inkwell.Repo

  defp series(user, title, attrs \\ %{}) do
    Repo.insert!(
      struct(
        Series,
        Map.merge(%{user_id: user.id, title: title, slug: Slug.slugify(title) || "s"}, attrs)
      )
    )
  end

  defp entry(user, attrs) do
    n = System.unique_integer([:positive])

    Repo.insert!(
      struct(
        Entry,
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{n}",
            slug: "post-#{n}",
            body_html: "<p>hi</p>",
            status: :published,
            privacy: :public,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )
    )
  end

  test "the Posts page lists entries in a series with the series' title and slug" do
    user = create_user()
    haiku = series(user, "Haiku")
    in_series = entry(user, %{series_id: haiku.id, series_order: 1})
    entry(user, %{})

    body = build_conn() |> log_in_user(user) |> get("/api/me/entries") |> json_response(200)

    assert length(body["data"]) == 2
    row = Enum.find(body["data"], &(&1["id"] == in_series.id))
    assert row["series_name"] == "Haiku"
    assert row["series_slug"] == haiku.slug
  end

  test "the writer's journal listing says which series an entry is in" do
    user = create_user()
    haiku = series(user, "Haiku")
    in_series = entry(user, %{series_id: haiku.id, series_order: 2})
    other = entry(user, %{})

    body = build_conn() |> get("/api/users/#{user.username}/entries") |> json_response(200)

    row = Enum.find(body["data"], &(&1["id"] == in_series.id))
    assert row["series"]["title"] == "Haiku"
    assert row["series"]["slug"] == haiku.slug
    assert row["series"]["username"] == user.username
    assert row["series"]["series_order"] == 2
    assert Enum.find(body["data"], &(&1["id"] == other.id))["series"] == nil
  end

  describe "search ?type=series" do
    test "finds series with a public entry by title or description" do
      user = create_user()
      haiku = series(user, "Haiku Notebook", %{description: "Short poems about mornings"})
      entry(user, %{series_id: haiku.id, series_order: 1})

      by_title = build_conn() |> get("/api/search?q=haiku&type=series") |> json_response(200)
      assert [%{"title" => "Haiku Notebook", "entry_count" => 1} = hit] = by_title["data"]
      assert hit["author"]["username"] == user.username
      assert hit["slug"] == haiku.slug

      by_description = build_conn() |> get("/api/search?q=mornings&type=series") |> json_response(200)
      assert [%{"title" => "Haiku Notebook"}] = by_description["data"]
    end

    test "leaves out series nobody can read and writers Explore hides" do
      user = create_user()
      empty = series(user, "Haiku Drafts")
      entry(user, %{series_id: empty.id, status: :draft, published_at: nil})
      private = series(user, "Haiku Private")
      entry(user, %{series_id: private.id, privacy: :private})

      limited = create_user()
      Repo.update_all(Ecto.Query.where(Inkwell.Accounts.User, id: ^limited.id), set: [moderation_state: "limited"])
      spam = series(limited, "Haiku Spam")
      entry(limited, %{series_id: spam.id})

      body = build_conn() |> get("/api/search?q=haiku&type=series") |> json_response(200)
      assert body["data"] == []
    end

    test "needs at least two characters and treats % literally" do
      user = create_user()
      s = series(user, "Haiku")
      entry(user, %{series_id: s.id})

      assert build_conn() |> get("/api/search?q=h&type=series") |> json_response(200) |> Map.get("data") == []
      assert build_conn() |> get("/api/search?q=%25%25&type=series") |> json_response(200) |> Map.get("data") == []
    end
  end
end
