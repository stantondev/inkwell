defmodule InkwellWeb.PenPalRequestGateTest do
  @moduledoc """
  Who may send pen pal requests (Inkwell.Moderation.RequestGate): limited
  accounts can't, new accounts need a bio and are capped at 20 a day.
  Accepting a request is never gated.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Repo, Social}
  alias Inkwell.Moderation.RequestGate

  defp with_bio(user, bio \\ "I write about trains."),
    do: user |> Ecto.Changeset.change(bio: bio) |> Repo.update!()

  defp aged(user, days) do
    at = DateTime.add(DateTime.utc_now(), -days * 86_400, :second)
    user |> Ecto.Changeset.change(inserted_at: at) |> Repo.update!()
  end

  defp request(conn, from, to) do
    conn |> log_in_user(from) |> post("/api/relationships/#{to.username}/follow")
  end

  test "a new account without a bio is asked for one", %{conn: conn} do
    me = create_user()
    them = create_user()

    body = conn |> request(me, them) |> json_response(403)
    assert body["code"] == "bio_required"
    assert body["error"] =~ "about yourself"
    assert {:error, :not_found} = Social.get_relationship(me.id, them.id)
  end

  test "an HTML-only empty bio still counts as blank" do
    user = create_user() |> Ecto.Changeset.change(bio_html: "<p> &nbsp;</p>") |> Repo.update!()
    assert RequestGate.blank_bio?(user)
  end

  test "a new account with a bio can send requests", %{conn: conn} do
    me = create_user() |> with_bio()
    them = create_user()

    assert %{"status" => "pending"} = conn |> request(me, them) |> json_response(200)
  end

  test "an older account without a bio is not asked", %{conn: conn} do
    me = create_user() |> aged(30)
    them = create_user()

    assert %{"status" => "pending"} = conn |> request(me, them) |> json_response(200)
  end

  test "a limited account can't send requests, whatever its age", %{conn: conn} do
    me = create_user() |> with_bio() |> aged(90)
    me = me |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    them = create_user()

    body = conn |> request(me, them) |> json_response(403)
    assert body["code"] == "requests_paused"
  end

  test "a limited account can still accept a request sent to it", %{conn: conn} do
    me = create_user() |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    them = create_user()
    {:ok, _} = Social.follow(them.id, me.id)

    assert %{"status" => "accepted"} = conn |> request(me, them) |> json_response(200)
  end

  test "new accounts are capped at 20 requests a day", %{conn: conn} do
    me = create_user() |> with_bio()

    for _ <- 1..RequestGate.new_account_daily_cap() do
      {:ok, _} = Social.follow(me.id, create_user().id)
    end

    body = conn |> request(me, create_user()) |> json_response(403)
    assert body["code"] == "request_limit"
  end

  test "an admin-cleared new account skips the new-account rules", %{conn: conn} do
    me = create_user() |> Ecto.Changeset.change(moderation_cleared_at: DateTime.utc_now()) |> Repo.update!()

    assert %{"status" => "pending"} = conn |> request(me, create_user()) |> json_response(200)
  end
end
