defmodule InkwellWeb.UserpicsTest do
  @moduledoc "LiveJournal-style userpics: upload, limits, choosing one per entry and comment."
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Repo, Userpics}
  alias Inkwell.Journals.Entry

  # A 1×1 PNG and a 1×1 GIF.
  @png "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  @gif "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

  defp upload(user, attrs) do
    build_conn() |> log_in_user(user) |> post("/api/me/icons", attrs)
  end

  test "upload, serve, rename and delete a userpic" do
    user = create_user()

    pic = upload(user, %{data: @png, keyword: "  coffee "}) |> json_response(201) |> Map.fetch!("data")
    assert pic["keyword"] == "coffee"
    assert pic["url"] == "/api/userpics/#{pic["id"]}"

    served = build_conn() |> get(pic["url"])
    assert served.status == 200
    assert Plug.Conn.get_resp_header(served, "content-type") |> hd() =~ "image/png"
    assert Plug.Conn.get_resp_header(served, "cache-control") == ["public, max-age=31536000, immutable"]

    renamed =
      build_conn() |> log_in_user(user) |> patch("/api/me/icons/#{pic["id"]}", %{keyword: "tea"})
      |> json_response(200)
    assert renamed["data"]["keyword"] == "tea"

    list = build_conn() |> log_in_user(user) |> get("/api/me/icons") |> json_response(200)
    assert %{"count" => 1, "limit" => 10} = list["meta"]

    assert build_conn() |> log_in_user(user) |> delete("/api/me/icons/#{pic["id"]}") |> response(204)
    assert build_conn() |> get(pic["url"]) |> response(404)
  end

  test "animated GIFs are kept; a file that isn't what it says is refused" do
    user = create_user()
    assert upload(user, %{data: @gif, keyword: "sparkle"}) |> json_response(201)

    fake = "data:image/png;base64," <> Base.encode64("not a png at all")
    assert %{"error" => _} = upload(user, %{data: fake, keyword: "fake"}) |> json_response(422)
  end

  test "keywords are unique per writer, ignoring case" do
    user = create_user()
    upload(user, %{data: @png, keyword: "Coffee"}) |> json_response(201)
    body = upload(user, %{data: @png, keyword: "coffee"}) |> json_response(422)
    assert body["error"] =~ "already used"
  end

  test "free accounts stop at their limit" do
    user = create_user()
    for n <- 1..Userpics.limit(user), do: upload(user, %{data: @png, keyword: "pic#{n}"}) |> json_response(201)
    body = upload(user, %{data: @png, keyword: "one more"}) |> json_response(422)
    assert body["error"] =~ "most your plan allows"
  end

  test "an entry wears its userpic; someone else's userpic is ignored" do
    user = create_user()
    other = create_user()
    mine = upload(user, %{data: @png, keyword: "mine"}) |> json_response(201) |> get_in(["data", "id"])
    theirs = upload(other, %{data: @png, keyword: "theirs"}) |> json_response(201) |> get_in(["data", "id"])

    post_entry = fn icon ->
      build_conn() |> log_in_user(user)
      |> post("/api/entries", %{title: "Hi", body_html: "<p>hi #{icon}</p>", privacy: "public", user_icon_id: icon})
      |> json_response(201)
      |> Map.fetch!("data")
    end

    entry = post_entry.(mine)
    assert entry["userpic"]["keyword"] == "mine"

    assert post_entry.(theirs)["userpic"] == nil

    listing = build_conn() |> get("/api/users/#{user.username}/entries") |> json_response(200)
    assert Enum.any?(listing["data"], &(&1["userpic"]["id"] == mine))

    # Deleting the picture sends the entry back to the avatar.
    build_conn() |> log_in_user(user) |> delete("/api/me/icons/#{mine}")
    assert Repo.get!(Entry, entry["id"]).user_icon_id == nil
  end

  test "a comment can wear the commenter's userpic" do
    author = create_user()
    commenter = create_user()
    pic = upload(commenter, %{data: @png, keyword: "wave"}) |> json_response(201) |> get_in(["data", "id"])

    entry_id =
      build_conn() |> log_in_user(author)
      |> post("/api/entries", %{title: "Hi", body_html: "<p>hi</p>", privacy: "public"})
      |> json_response(201) |> get_in(["data", "id"])

    comment =
      build_conn() |> log_in_user(commenter)
      |> post("/api/entries/#{entry_id}/comments", %{body_html: "<p>hello</p>", user_icon_id: pic})
      |> json_response(201) |> Map.fetch!("data")

    assert comment["userpic"]["keyword"] == "wave"
  end
end
