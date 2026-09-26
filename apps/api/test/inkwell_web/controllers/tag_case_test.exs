defmodule InkwellWeb.TagCaseTest do
  @moduledoc """
  Tags keep the writer's spelling but match without regard to case. Until
  2026-09-26 /tag/inkwell found 3 of 12 entries because 9 were tagged
  "Inkwell", and 15 production tags were split the same way.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals

  defp publish(user, tags, n) do
    {:ok, e} =
      Journals.create_entry(%{
        user_id: user.id,
        title: "Entry #{n}",
        body_html: "<p>Words for entry #{n}.</p>",
        tags: tags,
        privacy: :public,
        status: :published,
        published_at: DateTime.add(DateTime.utc_now(), -n * 60, :second)
      })

    e
  end

  setup do
    writer = create_user()
    a = publish(writer, ["Inkwell", "Writing"], 1)
    b = publish(writer, ["inkwell"], 2)
    c = publish(writer, ["INKWELL", "Тест"], 3)
    _other = publish(writer, ["fediverse"], 4)
    %{writer: writer, ids: Enum.sort([a.id, b.id, c.id]), a: a, c: c}
  end

  defp explore_ids(conn, tag) do
    conn
    |> get("/api/explore?tag=#{URI.encode_www_form(tag)}&source=inkwell")
    |> json_response(200)
    |> Map.fetch!("data")
    |> Enum.map(& &1["id"])
    |> Enum.sort()
  end

  test "the tag page finds every spelling", %{conn: conn, ids: ids} do
    assert explore_ids(conn, "inkwell") == ids
    assert explore_ids(conn, "Inkwell") == ids
    assert explore_ids(conn, "InKwElL") == ids
  end

  test "non-English tags match across case", %{conn: conn, c: c} do
    assert explore_ids(conn, "тест") == [c.id]
  end

  test "the tag RSS feed finds every spelling", %{conn: conn} do
    body = conn |> get("/api/tags/inkwell/feed.xml") |> response(200)
    assert length(Regex.scan(~r/<item>/, body)) == 3
  end

  test "profile filter and count find every spelling", %{conn: conn, writer: writer, ids: ids} do
    body = conn |> get("/api/users/#{writer.username}/entries?tag=inkwell") |> json_response(200)
    assert Enum.sort(Enum.map(body["data"], & &1["id"])) == ids
    assert Journals.count_entries_filtered(writer.id, tag: "inkwell") == 3
  end

  test "the tag cloud counts spellings as one tag, in the most common spelling" do
    assert Journals.count_tags(["Inkwell", "inkwell", "Inkwell", "Writing"]) |> Enum.sort() ==
             [{"Inkwell", 3}, {"Writing", 1}]
  end

  test "profile tag list merges spellings", %{writer: writer} do
    tags = Map.new(Journals.list_entry_tags(writer.id))
    assert tags["Inkwell"] == 3 or tags["inkwell"] == 3 or tags["INKWELL"] == 3
    assert map_size(tags) == 4
  end

  test "the sitemap lists a tag once, lowercased", %{conn: conn} do
    tags = conn |> get("/api/sitemap-data") |> json_response(200) |> Map.fetch!("tags")
    assert "inkwell" in tags
    refute "Inkwell" in tags
  end

  test "bulk remove takes out every spelling; bulk add doesn't duplicate one",
       %{writer: writer, ids: ids, a: a} do
    assert {:ok, 3} = Journals.bulk_add_tags(writer.id, ids, ["inkwell", "new"])

    for id <- ids do
      tags = Journals.get_entry!(id).tags
      assert Enum.count(tags, &(String.downcase(&1) == "inkwell")) == 1
      assert "new" in tags
    end

    # An entry keeps its own spelling and order.
    assert Journals.get_entry!(a.id).tags == ["Inkwell", "Writing", "new"]

    assert {:ok, 3} = Journals.bulk_remove_tags(writer.id, ids, ["inkwell"])

    for id <- ids do
      refute Enum.any?(Journals.get_entry!(id).tags, &(String.downcase(&1) == "inkwell"))
    end
  end
end
