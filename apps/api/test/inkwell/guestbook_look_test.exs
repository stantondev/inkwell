defmodule Inkwell.GuestbookLookTest do
  use InkwellWeb.ConnCase, async: false

  import Inkwell.Factory
  alias Inkwell.{ProfileHome, Repo}

  test "signers choose their paper; an unknown one falls back to cream", %{conn: conn} do
    owner = create_user()
    signer = create_user()
    conn = log_in_user(conn, signer)

    assert %{"data" => %{"stationery" => "rose", "author" => author}} =
             conn |> post("/api/users/#{owner.username}/guestbook", %{"body" => "Hello!", "stationery" => "rose"}) |> json_response(201)

    # The signer's avatar comes as a link, never the stored picture.
    refute String.starts_with?(author["avatar_url"] || "", "data:")

    assert %{"data" => %{"stationery" => "cream"}} =
             conn |> post("/api/users/#{owner.username}/guestbook", %{"body" => "Again", "stationery" => "<script>"}) |> json_response(201)
  end

  test "the guestbook block keeps a look of list, envelopes or postcards" do
    page = fn look ->
      %{"sections" => [%{"columns" => [%{"blocks" => [
        %{"id" => "b-card", "type" => "profile_card"},
        %{"id" => "b-entries", "type" => "entries"},
        %{"id" => "b-gb", "type" => "guestbook", "config" => %{"look" => look}}
      ]}]}]}
    end

    for look <- ~w[list envelopes postcards] do
      {:ok, home} = ProfileHome.normalize(page.(look))
      assert guestbook(home)["config"] == %{"look" => look}
    end

    {:ok, home} = ProfileHome.normalize(page.("scrolls"))
    assert guestbook(home)["config"] == %{}
  end

  test "a page nobody has arranged shows envelopes; a saved page keeps its list" do
    fresh = create_user()
    assert guestbook(ProfileHome.for_user(fresh))["config"] == %{"look" => "envelopes"}

    saved = fresh |> Ecto.Changeset.change(profile_home: ProfileHome.from_legacy(fresh)) |> Repo.update!()
    assert guestbook(ProfileHome.for_user(saved))["config"] == %{}
  end

  defp guestbook(home),
    do: home["sections"] |> Enum.flat_map(& &1["columns"]) |> Enum.flat_map(& &1["blocks"]) |> Enum.find(&(&1["type"] == "guestbook"))
end
