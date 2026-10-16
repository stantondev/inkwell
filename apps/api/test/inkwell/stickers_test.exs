defmodule Inkwell.StickersTest do
  use InkwellWeb.ConnCase, async: false

  import Inkwell.Factory
  import Ecto.Query
  alias Inkwell.{ProfileHome, Repo, Stickers}
  alias Inkwell.Journals.EntryImage
  alias Inkwell.Stickers.UserSticker

  # A 1×1 transparent PNG.
  @png "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

  defp week_old(attrs \\ %{}) do
    create_user(attrs)
    |> Ecto.Changeset.change(inserted_at: DateTime.add(DateTime.utc_now(), -10, :day))
    |> Repo.update!()
  end

  defp page(stickers) do
    %{
      "sections" => [%{"columns" => [%{"blocks" => [%{"id" => "b-card", "type" => "profile_card"}, %{"id" => "b-entries", "type" => "entries"}]}]}],
      "stickers" => stickers
    }
  end

  test "new and spam-held accounts can't upload; a week-old account can" do
    assert {:error, msg} = Stickers.create(create_user(), %{"data" => @png})
    assert msg =~ "a week old"

    limited = week_old() |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    assert {:error, msg} = Stickers.create(limited, %{"data" => @png})
    assert msg =~ "paused"

    user = week_old()
    assert {:ok, %UserSticker{} = s} = Stickers.create(user, %{"data" => @png, "name" => "  My cat  ", "ratio" => 1.5, "outline" => false})
    assert s.name == "My cat" and s.ratio == 1.5 and s.outline == false
    assert Repo.get(EntryImage, s.image_id).user_id == user.id
  end

  test "only real pictures, and at most 10 on the free plan" do
    user = week_old()
    svg = "data:image/svg+xml;base64," <> Base.encode64("<svg onload='alert(1)'/>")
    assert {:error, _} = Stickers.create(user, %{"data" => svg})
    assert {:error, _} = Stickers.create(user, %{"data" => "data:image/png;base64," <> Base.encode64("<html>")})

    for _ <- 1..10, do: {:ok, _} = Stickers.create(user, %{"data" => @png})
    assert {:error, msg} = Stickers.create(user, %{"data" => @png})
    assert msg =~ "10 stickers"
  end

  test "a page can show your own uploaded stickers, never someone else's" do
    user = week_old()
    other = week_old()
    {:ok, mine} = Stickers.create(user, %{"data" => @png, "ratio" => 2})
    {:ok, theirs} = Stickers.create(other, %{"data" => @png})

    {:ok, home} =
      ProfileHome.normalize(
        page([
          %{"key" => "upload", "image_id" => mine.image_id, "anchor" => "b-card", "edge" => "free", "x" => 30, "y" => 40, "ratio" => 2, "outline" => true},
          %{"key" => "upload", "image_id" => theirs.image_id, "anchor" => "b-card"},
          %{"key" => "upload", "image_id" => Ecto.UUID.generate(), "anchor" => "b-card"},
          %{"key" => "upload", "image_id" => "not-a-uuid", "anchor" => "b-card"}
        ]),
        owner_id: user.id,
        plus: false
      )

    assert [%{"key" => "upload", "image_id" => id, "ratio" => 2.0, "outline" => true, "edge" => "free"}] = home["stickers"]
    assert id == mine.image_id
    assert mine.image_id in ProfileHome.image_ids(home)
  end

  test "deleting a sticker takes it off the page and deletes the picture", %{conn: conn} do
    user = week_old()
    {:ok, s} = Stickers.create(user, %{"data" => @png})

    conn = log_in_user(conn, user)
    put(conn, "/api/me/home", %{"home" => page([
      %{"key" => "upload", "image_id" => s.image_id, "anchor" => "b-card"},
      %{"key" => "star", "anchor" => "b-card"}
    ])}) |> json_response(200)

    assert conn |> delete("/api/me/stickers/#{s.id}") |> response(204)
    home = Repo.reload(user).profile_home
    assert [%{"key" => "star"}] = home["stickers"]
    refute Repo.get(EntryImage, s.image_id)
  end

  test "orphan cleanup keeps library stickers that aren't placed yet" do
    user = week_old()
    {:ok, s} = Stickers.create(user, %{"data" => @png})
    old = DateTime.add(DateTime.utc_now(), -3, :day)
    from(i in EntryImage, where: i.id == ^s.image_id) |> Repo.update_all(set: [inserted_at: old])
    Inkwell.Journals.cleanup_orphaned_images(24)
    assert Repo.get(EntryImage, s.image_id)
  end

  test "the API lists stickers with the limits and why uploads are closed", %{conn: conn} do
    fresh = create_user()
    body = conn |> log_in_user(fresh) |> get("/api/me/stickers") |> json_response(200)
    assert body["meta"]["limit"] == 10 and body["meta"]["blocked_reason"] =~ "week old"

    user = week_old()
    conn = log_in_user(build_conn(), user)
    created = conn |> post("/api/me/stickers", %{"data" => @png, "name" => "Leaf"}) |> json_response(201)
    assert created["data"]["url"] == "/api/images/#{created["data"]["image_id"]}"
    assert [%{"name" => "Leaf"}] = (conn |> get("/api/me/stickers") |> json_response(200))["data"]
    patched = conn |> patch("/api/me/stickers/#{created["data"]["id"]}", %{"name" => "Oak leaf", "outline" => false}) |> json_response(200)
    assert patched["data"]["name"] == "Oak leaf" and patched["data"]["outline"] == false
  end
end
