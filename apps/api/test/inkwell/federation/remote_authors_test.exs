defmodule Inkwell.Federation.RemoteAuthorsTest do
  use InkwellWeb.ConnCase, async: false

  import Inkwell.Factory
  alias Inkwell.Repo
  alias Inkwell.Guestbook.GuestbookEntry

  defp sign_from_fediverse(owner, ap_id, avatar_url) do
    %GuestbookEntry{}
    |> GuestbookEntry.ap_changeset(%{
      body: "Hello from Mastodon",
      profile_user_id: owner.id,
      ap_id: "#{ap_id}/statuses/#{System.unique_integer([:positive])}",
      remote_author: %{
        "ap_id" => ap_id,
        "username" => "friend",
        "domain" => "mastodon.example",
        "display_name" => "Friend",
        "avatar_url" => avatar_url
      }
    })
    |> Repo.insert!()
  end

  test "a guestbook signature shows its signer's current picture, not the one saved when they signed",
       %{conn: conn} do
    owner = create_user()
    actor = create_remote_actor(avatar_url: "https://files.mastodon.example/new.png")
    sign_from_fediverse(owner, actor.ap_id, "https://files.mastodon.example/old-and-gone.png")

    assert %{"data" => [%{"remote_author" => ra}]} =
             conn |> get("/api/users/#{owner.username}/guestbook") |> json_response(200)

    assert ra["avatar_url"] == "https://files.mastodon.example/new.png"
    assert ra["username"] == "friend"
  end

  test "keeps the saved picture when we don't know the signer or they have none", %{conn: conn} do
    owner = create_user()
    unknown = "https://elsewhere.example/users/someone"
    sign_from_fediverse(owner, unknown, "https://elsewhere.example/a.png")

    no_picture = create_remote_actor(avatar_url: nil)
    sign_from_fediverse(owner, no_picture.ap_id, "https://files.mastodon.example/b.png")

    %{"data" => entries} = conn |> get("/api/users/#{owner.username}/guestbook") |> json_response(200)
    urls = entries |> Enum.map(& &1["remote_author"]["avatar_url"]) |> Enum.sort()
    assert urls == ["https://elsewhere.example/a.png", "https://files.mastodon.example/b.png"]
  end
end
