defmodule InkwellWeb.StampAlbumBookTest do
  @moduledoc "The stamp album book: every stamp received, and the writer's own arrangement."
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Social}
  alias Inkwell.Stamps.Album

  defp publish(user) do
    {:ok, e} =
      Journals.create_entry(%{
        user_id: user.id,
        title: "Post #{System.unique_integer([:positive])}",
        body_html: "<p>Words.</p>",
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now()
      })

    e
  end

  defp send_stamp(reader, entry, type) do
    build_conn()
    |> log_in_user(reader)
    |> post("/api/entries/#{entry.id}/stamp", Jason.encode!(%{stamp_type: type}))
    |> json_response(200)
  end

  defp book(user), do: build_conn() |> log_in_user(user) |> get("/api/me/stamp-album") |> json_response(200)

  defp save(user, album),
    do: build_conn() |> log_in_user(user) |> put("/api/me/stamp-album", Jason.encode!(%{album: album}))

  setup do
    writer = create_user()
    a = create_user()
    b = create_user()
    e1 = publish(writer)
    e2 = publish(writer)
    send_stamp(a, e1, "felt")
    send_stamp(b, e1, "thank_you")
    send_stamp(a, e2, "rooting")
    %{writer: writer, a: a, b: b}
  end

  test "lists every stamp received; no album until the writer arranges one", %{writer: w} do
    res = book(w)
    assert length(res["data"]["stamps"]) == 3
    assert res["data"]["album"] == nil
    assert Enum.all?(res["data"]["stamps"], &(&1["sender"]["username"] && &1["entry"]["slug"]))
  end

  test "saves an arrangement, cleaning it against the stamps the writer has", %{writer: w} do
    [s1, s2, s3] = book(w)["data"]["stamps"] |> Enum.map(& &1["id"])
    stranger = Ecto.UUID.generate()

    album = %{
      "cover" => "navy",
      "pages" => [
        %{"id" => "autumn", "title" => "  Autumn <b>leaves</b>\n", "paper" => "black", "slots" => [s1, nil, s2, s1, stranger]},
        %{"id" => "autumn", "title" => String.duplicate("x", 200), "paper" => "velvet", "slots" => "nope"},
        %{"id" => "BAD ID!", "slots" => [nil, s3]}
      ]
    }

    saved = save(w, album) |> json_response(200)
    [p1, p2, p3] = saved["data"]["album"]["pages"]

    assert saved["data"]["album"]["cover"] == "navy"
    assert p1["id"] == "autumn"
    assert p1["title"] == "Autumn leaves"
    assert p1["paper"] == "black"
    assert length(p1["slots"]) == Album.slots()
    # Each stamp once; strangers' ids gone.
    assert Enum.take(p1["slots"], 5) == [s1, nil, s2, nil, nil]
    assert p2["id"] != "autumn" and p2["paper"] == "cream" and String.length(p2["title"]) == 60
    assert Enum.all?(p2["slots"], &is_nil/1)
    assert p3["id"] =~ ~r/^p\d+$/
    assert Enum.at(p3["slots"], 1) == s3

    # Read back the same.
    assert book(w)["data"]["album"] == saved["data"]["album"]
  end

  test "a stamp taken back or from someone blocked drops out of the album", %{writer: w, a: a} do
    ids = book(w)["data"]["stamps"] |> Enum.map(& &1["id"])
    save(w, %{"pages" => [%{"slots" => ids}]}) |> json_response(200)

    {:ok, _} = Social.block(w.id, a.id)
    res = book(w)
    assert length(res["data"]["stamps"]) == 1
    kept = res["data"]["album"]["pages"] |> hd() |> Map.get("slots") |> Enum.reject(&is_nil/1)
    assert length(kept) == 1
  end

  test "one writer can't mount another writer's stamps", %{writer: w, a: a} do
    ids = book(w)["data"]["stamps"] |> Enum.map(& &1["id"])
    saved = save(a, %{"pages" => [%{"slots" => ids}]}) |> json_response(200)
    assert saved["data"]["album"]["pages"] |> hd() |> Map.get("slots") |> Enum.all?(&is_nil/1)
  end

  test "needs an album in the body and a session" do
    assert build_conn() |> get("/api/me/stamp-album") |> json_response(401)
    u = create_user()
    assert build_conn() |> log_in_user(u) |> put("/api/me/stamp-album", Jason.encode!(%{})) |> json_response(400)
  end
end
