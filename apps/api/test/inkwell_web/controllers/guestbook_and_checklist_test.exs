defmodule InkwellWeb.GuestbookAndChecklistTest do
  @moduledoc """
  Signing a guestbook notifies the owner (before 2026-09-24 only fediverse
  signatures did), bad paging params don't 500, and the new-member checklist
  reports each step.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Repo

  defp as(user), do: build_conn() |> log_in_user(user)

  test "signing someone's guestbook notifies them, with a preview" do
    owner = create_user()
    visitor = create_user()

    as(visitor)
    |> post("/api/users/#{owner.username}/guestbook", %{body: "Love your journal!"})
    |> json_response(201)

    n = Repo.one!(from n in Notification, where: n.user_id == ^owner.id and n.type == :guestbook)
    assert n.actor_id == visitor.id
    assert n.data["excerpt"] == "Love your journal!"
    assert n.data["profile_username"] == owner.username
  end

  test "signing your own guestbook doesn't notify you" do
    owner = create_user()
    as(owner) |> post("/api/users/#{owner.username}/guestbook", %{body: "hi"}) |> json_response(201)
    refute Repo.exists?(from n in Notification, where: n.user_id == ^owner.id and n.type == :guestbook)
  end

  test "non-numeric paging params fall back instead of crashing" do
    owner = create_user()
    body = build_conn() |> get("/api/users/#{owner.username}/guestbook?limit=abc&offset=-3") |> json_response(200)
    assert body["data"] == []
  end

  test "checklist reports each step" do
    user = create_user()
    other = create_user()

    data = as(user) |> get("/api/me/checklist") |> json_response(200) |> Map.fetch!("data")
    assert data == %{"profile" => false, "published" => false, "following" => 0, "responded" => false, "signed_guestbook" => false}

    {:ok, entry} =
      Inkwell.Journals.create_entry(%{"user_id" => other.id, "title" => "Hi", "body_html" => "<p>x</p>", "privacy" => "public"})

    {:ok, _} = Inkwell.Inks.toggle_ink(user.id, entry.id)
    {:ok, _} = Inkwell.Social.follow(user.id, other.id)
    as(user) |> post("/api/users/#{other.username}/guestbook", %{body: "hello"}) |> json_response(201)

    data = as(user) |> get("/api/me/checklist") |> json_response(200) |> Map.fetch!("data")
    assert data["responded"]
    assert data["following"] == 1
    assert data["signed_guestbook"]
  end
end
