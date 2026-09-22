defmodule InkwellWeb.AvatarEchoTest do
  @moduledoc """
  API responses carry avatars/banners as `/api/avatars/:username?v=…` links.
  The profile form PATCHes that link back; before 2026-09-22 it overwrote the
  stored image with a link to itself and the avatar 404'd for everyone.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Repo
  alias Inkwell.Accounts.User

  @png "data:image/png;base64," <> Base.encode64(<<137, 80, 78, 71, 13, 10, 26, 10, 0, 0>>)

  setup do
    user = create_user() |> Ecto.Changeset.change(avatar_url: @png, profile_banner_url: @png) |> Repo.update!()
    %{user: user}
  end

  test "echoing the public avatar and banner links leaves the stored images alone", %{user: user} do
    conn =
      build_conn()
      |> log_in_user(user)
      |> patch("/api/me", %{
        "display_name" => "New name",
        "avatar_url" => "/api/avatars/#{user.username}?v=123",
        "profile_banner_url" => "https://inkwell.social/api/banners/#{user.username}?v=123"
      })

    assert conn.status == 200
    saved = Repo.get!(User, user.id)
    assert saved.display_name == "New name"
    assert saved.avatar_url == @png
    assert saved.profile_banner_url == @png

    assert build_conn() |> get("/api/avatars/#{user.username}") |> Map.get(:status) == 200
  end

  test "clearing the avatar still works", %{user: user} do
    build_conn() |> log_in_user(user) |> patch("/api/me", %{"avatar_url" => nil})
    assert Repo.get!(User, user.id).avatar_url == nil
  end
end
