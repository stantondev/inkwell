defmodule Inkwell.ProfileHomeTest do
  use InkwellWeb.ConnCase, async: true

  import Inkwell.Factory

  alias Inkwell.{Accounts, ProfileHome, Repo}

  defp plus(user), do: user |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active") |> Repo.update!()

  defp shape(home) do
    for s <- home["sections"] do
      {s["style"], for(c <- s["columns"], do: {c["span"], Enum.map(c["blocks"], & &1["type"])})}
    end
  end

  describe "from_legacy/1" do
    test "a free account gets the classic page in the default order" do
      user = create_user()
      home = ProfileHome.from_legacy(user)

      assert home["width"] == "standard"

      assert shape(home) == [
               {"columns", [{12, ["profile_card"]}]},
               {"columns", [{12, ["divider"]}]},
               {"columns", [{12, ["pinned"]}]},
               {"columns",
                [
                  {9, ["entries"]},
                  {3, ~w[top_pals tags support newsletter series guestbook music custom_html rss]}
                ]}
             ]
    end

    test "a free account's saved Plus layout isn't shown (it wasn't before)" do
      user = create_user() |> Ecto.Changeset.change(profile_layout: "minimal", profile_widgets: %{"order" => ["guestbook"]}) |> Repo.update!()
      assert ProfileHome.from_legacy(user) == ProfileHome.from_legacy(create_user()) |> Map.put("width", "standard")
      assert [{"columns", _} | _] = shape(ProfileHome.from_legacy(user))
    end

    test "Plus: saved order first, new widgets after, hidden ones left out" do
      user =
        create_user()
        |> plus()
        |> Ecto.Changeset.change(profile_widgets: %{"order" => ["guestbook", "about", "entries", "music"], "hidden" => ["tags"]})
        |> Repo.update!()

      [_, _, _, {"columns", [{9, ["entries"]}, {3, side}]}] = shape(ProfileHome.from_legacy(user))
      assert side == ~w[guestbook music top_pals support newsletter series custom_html rss]
    end

    test "Plus wide and magazine: entries, then widgets poured into columns" do
      user = create_user() |> plus() |> Ecto.Changeset.change(profile_layout: "magazine") |> Repo.update!()
      home = ProfileHome.from_legacy(user)

      assert [_, _, _, {"columns", [{12, ["entries"]}]}, {"columns", [{12, ["divider"]}]}, {"flow", [{12, widgets}]}] = shape(home)
      assert List.last(widgets) == "rss"

      entries = home["sections"] |> Enum.at(3) |> get_in(["columns", Access.at(0), "blocks", Access.at(0)])
      assert entries["config"] == %{"display" => "magazine"}
    end

    test "Plus minimal: narrow page, every widget on its own row" do
      user = create_user() |> plus() |> Ecto.Changeset.change(profile_layout: "minimal") |> Repo.update!()
      home = ProfileHome.from_legacy(user)

      assert home["width"] == "narrow"
      assert length(home["sections"]) == 3 + 2 + 9
    end

    test "block ids are unique and stable" do
      home = ProfileHome.from_legacy(create_user())
      ids = ProfileHome.block_ids(home)
      assert ids == Enum.uniq(ids)
      assert "b-entries" in ids and "b-profile-card" in ids
      assert {:ok, ^home} = ProfileHome.normalize(home)
    end
  end

  describe "normalize/1" do
    test "drops unknown blocks, keys and second copies; keeps the card and entries" do
      {:ok, home} =
        ProfileHome.normalize(%{
          "width" => "giant",
          "evil" => "x",
          "sections" => [
            %{"id" => "s-a", "style" => "weird", "columns" => [
              %{"id" => "c-a", "span" => 40, "blocks" => [
                %{"id" => "b-g", "type" => "guestbook", "config" => %{"html" => "<script>"}},
                %{"id" => "b-g", "type" => "guestbook"},
                %{"id" => "b-x", "type" => "iframe"},
                %{"id" => "BAD ID", "type" => "divider"},
                "nonsense"
              ]}
            ]}
          ]
        })

      assert home["width"] == "standard"
      refute Map.has_key?(home, "evil")
      types = for s <- home["sections"], c <- s["columns"], b <- c["blocks"], do: b["type"]
      assert types == ["profile_card", "guestbook", "divider", "entries"]
      guestbook = home["sections"] |> Enum.at(1) |> get_in(["columns", Access.at(0), "blocks", Access.at(0)])
      assert guestbook["config"] == %{}
      assert home["sections"] |> Enum.at(1) |> get_in(["columns", Access.at(0), "span"]) == 12
      ids = ProfileHome.block_ids(home)
      assert ids == Enum.uniq(ids)
      assert Enum.all?(ids, &Regex.match?(~r/^[a-z0-9][a-z0-9_-]*$/, &1))
    end

    test "columns that ask for more than the grid are scaled back" do
      {:ok, home} =
        ProfileHome.normalize(%{"sections" => [%{"style" => "columns", "columns" => [
          %{"span" => 12, "blocks" => [%{"type" => "entries"}]},
          %{"span" => 12, "blocks" => [%{"type" => "profile_card"}]}
        ]}]})

      spans = for c <- hd(home["sections"])["columns"], do: c["span"]
      assert Enum.sum(spans) <= 12
    end

    test "tiles get sizes, other sections don't" do
      {:ok, home} =
        ProfileHome.normalize(%{"sections" => [%{"style" => "tiles", "columns" => [
          %{"blocks" => [%{"type" => "top_pals", "size" => %{"w" => 9, "h" => 2}}, %{"type" => "tags"}]}
        ]}]})

      [_, tiles, _] = home["sections"]
      [a, b] = hd(tiles["columns"])["blocks"]
      assert a["size"] == %{"w" => 4, "h" => 2}
      assert b["size"] == %{"w" => 1, "h" => 1}
    end

    test "rejects things that aren't a home" do
      assert {:error, _} = ProfileHome.normalize(nil)
      assert {:error, _} = ProfileHome.normalize(%{})
      assert {:error, _} = ProfileHome.normalize(%{"sections" => "no"})
    end
  end

  describe "saving the old customiser" do
    test "changing layout or widget order rebuilds the home" do
      user = create_user() |> plus()
      {:ok, user} = Accounts.update_user_profile(user, %{"profile_layout" => "wide"})
      assert [_, _, _, {"columns", [{12, ["entries"]}]}, _, {"flow", _}] = shape(user.profile_home)

      {:ok, user} = Accounts.update_user_profile(user, %{"profile_widgets" => %{"order" => ["music"], "html_mode" => "fullpage", "x" => 1}})
      assert user.profile_widgets == %{"order" => ["music"]}
      [{"flow", [{12, [first | _]}]} | _] = Enum.reverse(shape(user.profile_home))
      assert first == "music"
    end

    test "other edits leave the home alone" do
      user = create_user() |> plus()
      {:ok, user} = Accounts.update_user_profile(user, %{"profile_status" => "hi"})
      assert user.profile_home == nil
      assert ProfileHome.for_user(user) == ProfileHome.from_legacy(user)
    end
  end

  test "backfill writes a home for everyone without one, once" do
    a = create_user()
    b = create_user() |> plus() |> Ecto.Changeset.change(profile_layout: "minimal") |> Repo.update!()

    assert ProfileHome.backfill() >= 2
    assert Repo.reload(a).profile_home == ProfileHome.from_legacy(a)
    assert Repo.reload(b).profile_home["width"] == "narrow"
    assert ProfileHome.backfill() == 0
  end

  describe "profile responses" do
    test "carry the home and links for banner and background, not the images", %{conn: conn} do
      png = "data:image/png;base64," <> Base.encode64(<<0x89, "PNG", 13, 10, 26, 10>> <> :binary.copy(<<0>>, 64))

      user =
        create_user()
        |> Ecto.Changeset.change(profile_banner_url: png, profile_background_url: png)
        |> Repo.update!()

      data = conn |> get("/api/users/#{user.username}") |> json_response(200) |> Map.fetch!("data")
      assert data["profile_banner_url"] =~ ~r{^/api/banners/#{user.username}\?v=}
      assert data["profile_background_url"] =~ ~r{^/api/backgrounds/#{user.username}\?v=}
      assert %{"version" => 1, "sections" => [_ | _]} = data["profile_home"]

      conn = get(build_conn(), "/api/backgrounds/#{user.username}")
      assert conn.status == 200
      assert get_resp_header(conn, "content-type") |> hd() =~ "image/png"
    end

    test "echoing the background link back doesn't overwrite the image", %{conn: conn} do
      png = "data:image/png;base64," <> Base.encode64(<<0x89, "PNG", 13, 10, 26, 10>> <> :binary.copy(<<0>>, 64))
      user = create_user() |> plus() |> Ecto.Changeset.change(profile_background_url: png) |> Repo.update!()

      conn
      |> log_in_user(user)
      |> patch("/api/me", %{"profile_background_url" => "/api/backgrounds/#{user.username}?v=1", "profile_status" => "x"})
      |> json_response(200)

      assert Repo.reload(user).profile_background_url == png
    end
  end
end
