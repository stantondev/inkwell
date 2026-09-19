defmodule InkwellWeb.EntryDateEditTest do
  @moduledoc """
  Writers set an entry's date from the editor (roadmap "Better import tools",
  @kltrtrgr). Backdating works for drafts and published entries; future dates
  are refused because Inkwell doesn't schedule posts.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp published(user) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", %{title: "Hello", body_html: "<p>hi</p>", privacy: "public"})
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp patch_entry(user, id, attrs) do
    build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", attrs)
  end

  test "a published entry can be backdated" do
    user = create_user()
    id = published(user)

    patch_entry(user, id, %{published_at: "2014-01-05T09:30:00Z"}) |> json_response(200)

    assert Repo.get!(Entry, id).published_at == ~U[2014-01-05 09:30:00.000000Z]
  end

  test "a published entry can't be moved into the future" do
    user = create_user()
    id = published(user)
    before = Repo.get!(Entry, id).published_at
    future = DateTime.utc_now() |> DateTime.add(3, :day) |> DateTime.to_iso8601()

    body = patch_entry(user, id, %{published_at: future}) |> json_response(422)

    assert body["errors"]["published_at"] == ["cannot be in the future"]
    assert Repo.get!(Entry, id).published_at == before
  end

  test "editing without a date leaves the date alone" do
    user = create_user()
    id = published(user)
    patch_entry(user, id, %{published_at: "2014-01-05T09:30:00Z"}) |> json_response(200)

    patch_entry(user, id, %{title: "Renamed"}) |> json_response(200)

    assert Repo.get!(Entry, id).published_at == ~U[2014-01-05 09:30:00.000000Z]
  end

  test "a new draft keeps the date it was created with" do
    user = create_user()

    id =
      build_conn()
      |> log_in_user(user)
      |> post("/api/entries", %{
        title: "Old",
        body_html: "<p>hi</p>",
        privacy: "public",
        status: "draft",
        published_at: "2014-01-05T09:30:00Z"
      })
      |> json_response(201)
      |> get_in(["data", "id"])

    assert Repo.get!(Entry, id).published_at == ~U[2014-01-05 09:30:00.000000Z]
  end

  test "a draft's date carries through to publishing" do
    user = create_user()

    id =
      build_conn()
      |> log_in_user(user)
      |> post("/api/entries", %{title: "Old", body_html: "<p>hi</p>", privacy: "public", status: "draft"})
      |> json_response(201)
      |> get_in(["data", "id"])

    patch_entry(user, id, %{published_at: "2016-06-01T12:00:00Z"}) |> json_response(200)

    build_conn()
    |> log_in_user(user)
    |> post("/api/entries/#{id}/publish", %{title: "Old", body_html: "<p>hi</p>", privacy: "public"})
    |> json_response(200)

    entry = Repo.get!(Entry, id)
    assert entry.status == :published
    assert entry.published_at == ~U[2016-06-01 12:00:00.000000Z]
  end
end
