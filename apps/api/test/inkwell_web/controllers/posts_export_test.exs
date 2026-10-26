defmodule InkwellWeb.PostsExportTest do
  @moduledoc """
  The Posts page as a spreadsheet (roadmap "Export List of Posts").
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  NimbleCSV.define(ExportTestCSV, separator: ",", escape: "\"")

  defp entry(user, attrs) do
    Repo.insert!(
      struct(
        Entry,
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{System.unique_integer([:positive])}",
            body_html: "<p>hi</p>",
            status: :draft,
            privacy: :public
          },
          attrs
        )
      )
    )
  end

  defp export(user, query \\ "") do
    build_conn() |> log_in_user(user) |> get("/api/me/entries/export#{query}")
  end

  defp rows(conn) do
    "﻿" <> csv = response(conn, 200)
    [headers | rows] = ExportTestCSV.parse_string(csv, skip_headers: false)
    Enum.map(rows, fn row -> headers |> Enum.zip(row) |> Map.new() end)
  end

  test "downloads every entry the writer has, as CSV with readable columns" do
    user = create_user()

    entry(user, %{
      title: "Tom &amp; Jerry",
      status: :published,
      slug: "tom-jerry",
      privacy: :friends_only,
      published_at: ~U[2026-03-04 05:06:07.000000Z],
      category: :creative_writing,
      tags: ["cats", "mice"],
      word_count: 460,
      ink_count: 3,
      content_warning: "mild peril",
      sensitive: true,
      imported_from: "livejournal"
    })

    entry(user, %{title: "Next week", scheduled_at: DateTime.add(DateTime.utc_now(), 7 * 86_400, :second)})
    entry(create_user(), %{title: "Someone else's"})

    conn = export(user)
    assert [content_type] = get_resp_header(conn, "content-type")
    assert content_type =~ "text/csv"
    assert [disposition] = get_resp_header(conn, "content-disposition")
    assert disposition =~ ~s(attachment; filename="inkwell-posts-#{user.username}-)

    rows = rows(conn)
    assert length(rows) == 2
    published = Enum.find(rows, &(&1["Status"] == "Published"))

    assert published["Title"] == "Tom & Jerry"
    assert published["Who can read it"] == "Pen Pals only"
    assert published["Date (UTC)"] == "2026-03-04 05:06"
    assert published["Category"] == "Creative Writing"
    assert published["Tags"] == "cats, mice"
    assert published["Words"] == "460"
    assert published["Minutes to read"] == "2"
    assert published["Inks"] == "3"
    assert published["Content warning"] == "mild peril"
    assert published["Imported from"] == "LiveJournal"
    assert published["Link"] =~ ~r{/#{user.username}/tom-jerry\z}

    scheduled = Enum.find(rows, &(&1["Title"] == "Next week"))
    assert scheduled["Status"] == "Scheduled"
    assert scheduled["Scheduled for (UTC)"] != ""
    assert scheduled["Link"] == ""
  end

  test "uses the Posts page filters" do
    user = create_user()
    entry(user, %{title: "Draft one"})
    entry(user, %{title: "Out there", status: :published, slug: "out", published_at: DateTime.utc_now()})

    assert [%{"Title" => "Draft one"}] = export(user, "?status=draft") |> rows()
    assert [%{"Title" => "Out there"}] = export(user, "?q=there") |> rows()
  end

  test "text that a spreadsheet would run as a formula is kept as text" do
    user = create_user()
    entry(user, %{title: "=HYPERLINK(\"http://x\")", tags: ["+1"]})

    [row] = export(user) |> rows()
    assert row["Title"] == "'=HYPERLINK(\"http://x\")"
    assert row["Tags"] == "'+1"
  end

  test "needs a signed-in writer" do
    assert build_conn() |> get("/api/me/entries/export") |> response(401)
  end
end
