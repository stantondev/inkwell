defmodule Inkwell.StickerGiftsTest do
  use InkwellWeb.ConnCase, async: false

  import Inkwell.Factory
  import Ecto.Query
  alias Inkwell.{ProfileHome, Repo, StickerGifts, Stickers}
  alias Inkwell.Accounts.{Notification, User}
  alias Inkwell.Journals.EntryImage
  alias Inkwell.StickerGifts.StickerGift

  @png "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

  defp week_old(attrs \\ %{}) do
    create_user(attrs)
    |> Ecto.Changeset.change(inserted_at: DateTime.add(DateTime.utc_now(), -10, :day))
    |> Repo.update!()
  end

  defp pen_pals(a, b), do: create_relationship(%{follower_id: a.id, following_id: b.id, status: :accepted})

  defp plus(user),
    do: user |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active") |> Repo.update!()

  defp page(stickers) do
    %{
      "sections" => [%{"columns" => [%{"blocks" => [%{"id" => "b-card", "type" => "profile_card"}, %{"id" => "b-entries", "type" => "entries"}]}]}],
      "stickers" => stickers
    }
  end

  test "only pen pals can give, not yourself, not across a block, not when held back" do
    giver = create_user()
    friend = create_user()
    stranger = create_user()
    pen_pals(friend, giver)

    assert {:error, msg} = StickerGifts.give(giver, stranger, %{"key" => "stamp"})
    assert msg =~ "pen pals"
    assert {:error, _} = StickerGifts.give(giver, giver, %{"key" => "stamp"})

    assert {:ok, %StickerGift{key: "stamp", note: "for you"}} =
             StickerGifts.give(giver, friend, %{"key" => "stamp", "note" => "  for you  "})

    assert Repo.exists?(from n in Notification, where: n.user_id == ^friend.id and n.type == :sticker_gift)

    limited = giver |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    assert {:error, msg} = StickerGifts.give(limited, friend, %{"key" => "stamp"})
    assert msg =~ "paused"

    Inkwell.Social.block(friend.id, giver.id)
    assert {:error, _} = StickerGifts.give(giver, friend, %{"key" => "stamp"})
  end

  test "Keepsakes need Plus to give, and show for a free recipient" do
    giver = create_user()
    friend = create_user()
    pen_pals(giver, friend)

    assert {:error, msg} = StickerGifts.give(giver, friend, %{"key" => "rose"})
    assert msg =~ "Plus"
    assert {:error, _} = StickerGifts.give(giver, friend, %{"key" => "not-a-sticker"})

    {:ok, gift} = StickerGifts.give(plus(giver), friend, %{"key" => "rose"})

    # The recipient is free: a rose of their own is dropped, the gifted one stays.
    {:ok, home} =
      ProfileHome.normalize(
        page([
          %{"key" => "rose", "anchor" => "b-card"},
          %{"key" => "stamp", "gift_id" => gift.id, "anchor" => "b-card", "x" => 20}
        ]),
        owner_id: friend.id,
        plus: false
      )

    # Saving takes the sticker from the gift, not from what was sent.
    assert [%{"key" => "rose", "gift_id" => gift_id, "x" => 20.0}] = home["stickers"]
    assert gift_id == gift.id
  end

  test "each gift goes on the page once, and only to its recipient" do
    giver = create_user()
    friend = create_user()
    other = create_user()
    pen_pals(giver, friend)
    {:ok, gift} = StickerGifts.give(giver, friend, %{"key" => "heart"})

    {:ok, home} =
      ProfileHome.normalize(
        page([
          %{"key" => "heart", "gift_id" => gift.id, "anchor" => "b-card"},
          %{"key" => "heart", "gift_id" => gift.id, "anchor" => "b-entries"}
        ]),
        owner_id: friend.id
      )

    assert length(home["stickers"]) == 1

    {:ok, theirs} = ProfileHome.normalize(page([%{"key" => "heart", "gift_id" => gift.id, "anchor" => "b-card"}]), owner_id: other.id)
    assert theirs["stickers"] == []
  end

  test "a gift of your own sticker survives you deleting it from your library" do
    giver = week_old()
    friend = create_user()
    pen_pals(friend, giver)
    {:ok, mine} = Stickers.create(giver, %{"data" => @png, "ratio" => 2})

    assert {:error, _} = StickerGifts.give(friend, giver, %{"sticker_id" => mine.id})
    {:ok, gift} = StickerGifts.give(giver, friend, %{"sticker_id" => mine.id})
    assert gift.key == "upload" and gift.image_id == mine.image_id and gift.ratio == 2.0

    {:ok, home} = ProfileHome.normalize(page([%{"key" => "upload", "gift_id" => gift.id, "anchor" => "b-card"}]), owner_id: friend.id)
    assert [%{"key" => "upload", "image_id" => image_id, "ratio" => 2.0}] = home["stickers"]
    assert image_id == mine.image_id

    {:ok, :ok} = Stickers.delete(giver, mine)
    assert Repo.get(EntryImage, mine.image_id)
    assert mine.image_id in StickerGifts.all_image_ids()
  end

  test "putting a gift away takes it off the page; visitors see who gave the rest", %{conn: conn} do
    giver = create_user(%{username: "marko"})
    friend = create_user()
    pen_pals(giver, friend)
    {:ok, g1} = StickerGifts.give(giver, friend, %{"key" => "daisy", "note" => "hi"})
    {:ok, g2} = StickerGifts.give(giver, friend, %{"key" => "leaf"})

    conn = log_in_user(conn, friend)

    gifts = conn |> get("/api/me/sticker-gifts") |> json_response(200)
    assert [%{"key" => "leaf", "from" => %{"username" => "marko"}}, %{"key" => "daisy", "note" => "hi"}] = gifts["data"]

    put(conn, "/api/me/home", %{"home" => page([
      %{"key" => "daisy", "gift_id" => g1.id, "anchor" => "b-card"},
      %{"key" => "leaf", "gift_id" => g2.id, "anchor" => "b-card"}
    ])}) |> json_response(200)

    assert conn |> delete("/api/me/sticker-gifts/#{g1.id}") |> response(204)
    assert [%{"gift_id" => g2_id}] = Repo.get!(User, friend.id).profile_home["stickers"]
    assert g2_id == g2.id

    profile = build_conn() |> get("/api/users/#{friend.username}") |> json_response(200)
    assert [%{"username" => "marko"}] = profile["meta"]["sticker_givers"]
    assert profile["meta"]["can_give_sticker"] == false

    # A gift deleted some other way is left off the page visitors see.
    Repo.delete!(g2)
    profile = build_conn() |> get("/api/users/#{friend.username}") |> json_response(200)
    assert profile["data"]["profile_home"]["stickers"] == []
    assert profile["meta"]["sticker_givers"] == []
  end

  test "the API: giving through a profile, and a daily limit", %{conn: conn} do
    giver = create_user()
    friend = create_user()
    pen_pals(giver, friend)
    conn = log_in_user(conn, giver)

    profile = conn |> get("/api/users/#{friend.username}") |> json_response(200)
    assert profile["meta"]["can_give_sticker"] == true

    assert %{"data" => %{"key" => "star"}} =
             conn |> post("/api/users/#{friend.username}/sticker-gifts", %{"key" => "star"}) |> json_response(201)

    for _ <- 2..StickerGifts.daily_limit(), do: {:ok, _} = StickerGifts.give(giver, friend, %{"key" => "star"})

    assert %{"error" => msg} =
             conn |> post("/api/users/#{friend.username}/sticker-gifts", %{"key" => "star"}) |> json_response(422)

    assert msg =~ "tomorrow"
  end
end
