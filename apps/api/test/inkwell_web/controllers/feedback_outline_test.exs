defmodule InkwellWeb.FeedbackOutlineTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Feedback
  alias Inkwell.Repo

  defp item(author, title, attrs) do
    {:ok, p} =
      Feedback.create_post(%{
        "title" => title,
        "body" => Map.get(attrs, :body, "Some details about #{title}"),
        "category" => Map.get(attrs, :category, "feature"),
        "user_id" => author.id
      })

    changes = Map.take(attrs, [:status, :vote_count, :completed_at, :release_note])
    p |> Ecto.Changeset.change(changes) |> Repo.update!()
  end

  defp outline(query) do
    build_conn() |> get("/api/feedback/outline?" <> URI.encode_query(query)) |> json_response(200)
  end

  setup do
    a = create_user()
    b = create_user()

    open_low = item(a, "Quiet idea", %{vote_count: 1})
    open_high = item(b, "Loved idea", %{status: :planned, vote_count: 9, category: "bug"})

    old_ship =
      item(a, "Shipped long ago", %{
        status: :done,
        completed_at: ~U[2026-03-02 10:00:00.000000Z],
        release_note: "Gallery layouts arrived"
      })

    new_ship = item(b, "Shipped yesterday", %{status: :done, completed_at: ~U[2026-11-03 10:00:00.000000Z]})
    declined = item(a, "Not doing this", %{status: :declined})

    %{open_low: open_low, open_high: open_high, old_ship: old_ship, new_ship: new_ship, declined: declined}
  end

  test "open items come back most-voted first, without shipped or declined", ctx do
    %{"data" => data} = outline(%{group: "open"})
    assert Enum.map(data, & &1["id"]) == [ctx.open_high.id, ctx.open_low.id]
    assert hd(data)["username"]
    refute Map.has_key?(hd(data), "user_id")
    # Catalogue numbers count every post ever filed, oldest first
    assert Enum.map(data, & &1["number"]) == [2, 1]
  end

  test "an item page knows its catalogue number", ctx do
    %{"data" => data} = build_conn() |> get("/api/feedback/#{ctx.new_ship.id}") |> json_response(200)
    assert data["number"] == 4
  end

  test "shipped items run newest-shipped first", ctx do
    %{"data" => data} = outline(%{group: "shipped", sort: "most_voted"})
    assert Enum.map(data, & &1["id"]) == [ctx.new_ship.id, ctx.old_ship.id]
  end

  test "category and search narrow the list (search reads release notes too)", ctx do
    assert [%{"id" => id}] = outline(%{group: "open", category: "bug"})["data"]
    assert id == ctx.open_high.id

    assert [%{"id" => id}] = outline(%{group: "all", q: "gallery"})["data"]
    assert id == ctx.old_ship.id

    # LIKE characters are matched literally
    assert [] == outline(%{group: "all", q: "%%"})["data"]
  end

  test "the summary counts every group and shipped months" do
    %{"meta" => meta} = outline(%{group: "open"})
    assert meta["open"] == 2
    assert meta["shipped"] == 2
    assert meta["declined"] == 1
    assert meta["contributors"] == 2
    assert %{"month" => "2026-03", "count" => 1} in meta["shipped_by_month"]
    assert %{"month" => "2026-11", "count" => 1} in meta["shipped_by_month"]
  end

  test "the list endpoint searches and sorts by ship date", ctx do
    %{"data" => data} =
      build_conn()
      |> get("/api/feedback?status=done&sort=recently_shipped")
      |> json_response(200)

    assert Enum.map(data, & &1["id"]) == [ctx.new_ship.id, ctx.old_ship.id]

    %{"data" => found} = build_conn() |> get("/api/feedback?q=loved") |> json_response(200)
    assert Enum.map(found, & &1["id"]) == [ctx.open_high.id]
  end
end
