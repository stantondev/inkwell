defmodule InkwellWeb.CoverAltTest do
  @moduledoc """
  Writers describe their cover image (roadmap "alt text for cover images").
  The description is saved, returned, and sent to the fediverse as the
  cover Image's `name`, which Mastodon shows as alt text.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp create(user, attrs) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", Map.merge(%{title: "Hello", body_html: "<p>hi</p>", privacy: "public"}, attrs))
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp patch_entry(user, id, attrs) do
    build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", attrs)
  end

  test "the description is saved trimmed and returned" do
    user = create_user()
    cover = Ecto.UUID.generate()
    id = create(user, %{cover_image_id: cover, cover_image_alt: "  A heron on a grey river at dawn  "})

    assert Repo.get!(Entry, id).cover_image_alt == "A heron on a grey river at dawn"

    body = build_conn() |> log_in_user(user) |> get("/api/entries/#{id}") |> json_response(200)
    assert body["data"]["cover_image_alt"] == "A heron on a grey river at dawn"
  end

  test "a blank description is stored as none" do
    user = create_user()
    id = create(user, %{cover_image_id: Ecto.UUID.generate(), cover_image_alt: "A cat"})

    patch_entry(user, id, %{cover_image_alt: "   "}) |> json_response(200)

    assert Repo.get!(Entry, id).cover_image_alt == nil
  end

  test "removing the cover removes its description" do
    user = create_user()
    id = create(user, %{cover_image_id: Ecto.UUID.generate(), cover_image_alt: "A cat"})

    patch_entry(user, id, %{cover_image_id: nil, cover_image_alt: "A cat"}) |> json_response(200)

    entry = Repo.get!(Entry, id)
    assert entry.cover_image_id == nil
    assert entry.cover_image_alt == nil
  end

  test "an edit that doesn't mention the description keeps it" do
    user = create_user()
    id = create(user, %{cover_image_id: Ecto.UUID.generate(), cover_image_alt: "A cat"})

    patch_entry(user, id, %{title: "Renamed"}) |> json_response(200)

    assert Repo.get!(Entry, id).cover_image_alt == "A cat"
  end

  test "descriptions over 1500 characters are refused" do
    user = create_user()
    id = create(user, %{cover_image_id: Ecto.UUID.generate()})

    body = patch_entry(user, id, %{cover_image_alt: String.duplicate("a", 1501)}) |> json_response(422)

    assert body["errors"]["cover_image_alt"]
  end

  test "the fediverse gets the description as the cover's name" do
    user = create_user()
    cover = Ecto.UUID.generate()
    id = create(user, %{cover_image_id: cover, cover_image_alt: "A heron on a grey river"})
    entry = Repo.get!(Entry, id)

    article = ActivityBuilder.build_article(entry, user)

    assert article["image"]["name"] == "A heron on a grey river"
    assert article["image"]["url"] =~ cover
    assert article["preview"]["attachment"]["name"] == "A heron on a grey river"
  end

  test "a cover without a description sends no name" do
    user = create_user()
    id = create(user, %{cover_image_id: Ecto.UUID.generate()})

    article = ActivityBuilder.build_article(Repo.get!(Entry, id), user)

    refute Map.has_key?(article["image"], "name")
  end
end
