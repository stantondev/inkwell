defmodule InkwellWeb.EntryMoodTest do
  @moduledoc """
  LiveJournal-style moods: an entry keeps the mood's words, the face it wears
  (`mood_key`) and a "Current location"; the writer picks an icon theme.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp create_entry(user, attrs) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", Map.merge(%{title: "Hello", body_html: "<p>hi</p>", privacy: "public"}, attrs))
  end

  test "an entry stores and returns its mood, face and location" do
    user = create_user()

    data =
      create_entry(user, %{mood: "up way too late", mood_key: "sleepy", location: "  Indianapolis  "})
      |> json_response(201)
      |> Map.fetch!("data")

    assert data["mood"] == "up way too late"
    assert data["mood_key"] == "sleepy"
    assert data["location"] == "Indianapolis"

    entry = Repo.get!(Entry, data["id"])
    assert {entry.mood_key, entry.location} == {"sleepy", "Indianapolis"}
  end

  test "a malformed mood key is refused and blanks are stored as nothing" do
    user = create_user()

    body = create_entry(user, %{mood: "odd", mood_key: "<script>"}) |> json_response(422)
    assert body["errors"]["mood_key"]

    data = create_entry(user, %{mood_key: "", location: "   "}) |> json_response(201) |> Map.fetch!("data")
    assert data["mood_key"] == nil
    assert data["location"] == nil
  end

  test "the entry page and profile listing carry the writer's icon theme" do
    user = create_user()

    build_conn()
    |> log_in_user(user)
    |> patch("/api/me", %{settings: %{mood_theme: "ink"}})
    |> json_response(200)

    data = create_entry(user, %{mood: "happy", mood_key: "happy"}) |> json_response(201) |> Map.fetch!("data")
    assert data["mood_theme"] == "ink"

    listing = build_conn() |> get("/api/users/#{user.username}/entries") |> json_response(200)
    assert [%{"mood_theme" => "ink", "mood_key" => "happy"}] = listing["data"]
  end

  test "only known icon themes are kept" do
    user = create_user()

    build_conn()
    |> log_in_user(user)
    |> patch("/api/me", %{settings: %{mood_theme: "sparkly"}})
    |> json_response(200)

    refute Map.has_key?(Repo.reload!(user).settings || %{}, "mood_theme")
  end

  test "the Classic view setting keeps only known looks" do
    user = create_user()
    conn = build_conn() |> log_in_user(user)

    patch(conn, "/api/me", %{settings: %{site_look: "classic"}}) |> json_response(200)
    assert Repo.reload!(user).settings["site_look"] == "classic"

    build_conn() |> log_in_user(user) |> patch("/api/me", %{settings: %{site_look: "geocities"}}) |> json_response(200)
    refute Map.has_key?(Repo.reload!(user).settings, "site_look")
  end
end
