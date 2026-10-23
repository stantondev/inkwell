defmodule InkwellWeb.TagSearchTest do
  @moduledoc """
  Explore search and tags (@stoicalgeezer, 2026-10-22): he tagged his poems
  `series-short-poems`, searched `#series-short-poems` in Explore and got
  "Nothing in the index". The search Explore actually runs on looked at titles
  and post text only.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

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

  defp search(q, type) do
    build_conn() |> get("/api/search", %{q: q, type: type}) |> json_response(200) |> Map.get("data")
  end

  test "entry search finds a tag, with or without the #" do
    user = create_user()
    tagged = entry(user, %{title: "Pen and Paper", tags: ["Pens", "series-short-poems"]})
    entry(user, %{title: "Something else", tags: ["weather"]})

    for q <- ["#series-short-poems", "series-short-poems", "#Series-Short"] do
      assert [%{"id" => id}] = search(q, "entries"), "no match for #{q}"
      assert id == tagged.id
    end
  end

  test "tag search lists matching tags with counts, exact match first" do
    a = create_user()
    b = create_user()
    entry(a, %{tags: ["series-short-poems"]})
    entry(a, %{tags: ["Series-Short-Poems"]})
    entry(b, %{tags: ["series-short-poems", "poems"]})
    entry(b, %{tags: ["poems"]})
    entry(b, %{tags: ["prose poems"]})

    assert [first | rest] = search("#poems", "tags")
    assert first == %{"tag" => "poems", "slug" => "poems", "entries" => 2}
    assert %{"tag" => "series-short-poems", "slug" => "series-short-poems", "entries" => 3} in rest
    assert Enum.any?(rest, &(&1["slug"] == "prose poems"))

    assert [%{"entries" => 3}] = search("series-short", "tags")
  end

  test "tag search leaves out drafts, private posts and writers Explore hides" do
    user = create_user()
    entry(user, %{tags: ["haiku"], status: :draft, published_at: nil})
    entry(user, %{tags: ["haiku"], privacy: :private})

    limited = create_user()
    Repo.update_all(Ecto.Query.where(Inkwell.Accounts.User, id: ^limited.id), set: [moderation_state: "limited"])
    entry(limited, %{tags: ["haiku"]})

    assert search("haiku", "tags") == []
    assert search("#", "tags") == []
    assert search("%_", "tags") == []
  end

  describe "Entry.clean_tags/1" do
    test "drops #, splits hashtag runs, keeps ordinary tags, one of each" do
      assert Entry.clean_tags(["#DailyInk", "DailyInk", "##dailyink"]) == ["DailyInk"]
      assert Entry.clean_tags(["#teen #tobeteen #teengirl"]) == ["teen", "tobeteen", "teengirl"]
      assert Entry.clean_tags(["#HomeRenovation#LVT #LVP"]) == ["HomeRenovation", "LVT", "LVP"]
      assert Entry.clean_tags(["#тест", "  Music   Education ", "C#", "", "  ", "#"]) ==
               ["тест", "Music Education", "C#"]
    end

    test "saving an entry stores clean tags" do
      user = create_user()

      {:ok, entry} =
        Inkwell.Journals.create_entry(%{
          user_id: user.id,
          title: "Tagged",
          body_html: "<p>hello there</p>",
          privacy: :public,
          tags: ["#DailyInk", "#a #b"]
        })

      assert entry.tags == ["DailyInk", "a", "b"]
    end
  end
end
