defmodule InkwellWeb.ProfileArchiveTest do
  @moduledoc """
  Profile archive (2026-09-22): the entry list, its total, and the year /
  month / tag / category lists all follow one rule for what the viewer may
  read. Before, the lists counted private entries for everyone, and pen pals
  saw friends-only entries that the page total left out.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals

  defp entry(user, at, privacy, extra \\ %{}) do
    n = System.unique_integer([:positive])

    {:ok, e} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "Entry #{n}",
            body_html: "<p>Words #{n}</p>",
            privacy: privacy,
            status: :published,
            published_at: at
          },
          extra
        )
      )

    e
  end

  setup do
    writer = create_user()
    entry(writer, ~U[2004-12-21 20:00:00Z], :public, %{tags: ["school"], category: :personal})
    entry(writer, ~U[2004-12-25 20:00:00Z], :public)
    entry(writer, ~U[2005-01-02 10:00:00Z], :friends_only, %{tags: ["secret-tag"], category: :travel})
    entry(writer, ~U[2006-10-04 07:37:00Z], :private, %{tags: ["diary"]})
    %{writer: writer}
  end

  defp profile_meta(conn, writer), do: conn |> get("/api/users/#{writer.username}") |> json_response(200) |> Map.fetch!("meta")

  test "strangers only see public entries in counts, years, months, tags and categories", %{writer: writer} do
    meta = profile_meta(build_conn(), writer)
    assert meta["entry_count"] == 2
    assert meta["entry_years"] == [2004]
    assert meta["entry_months"] == [%{"year" => 2004, "month" => 12, "count" => 2}]
    assert Enum.map(meta["entry_tags"], & &1["tag"]) == ["school"]
    assert Enum.map(meta["entry_categories"], & &1["category"]) == ["personal"]
  end

  test "the writer sees all their published entries in the archive", %{writer: writer} do
    meta = build_conn() |> log_in_user(writer) |> profile_meta(writer)
    assert meta["entry_count"] == 4
    assert meta["entry_years"] == [2006, 2005, 2004]
  end

  test "pen pals see friends-only entries, and the page total agrees", %{writer: writer} do
    pal = create_user()
    create_relationship(%{follower_id: pal.id, following_id: writer.id, status: :accepted})

    conn = build_conn() |> log_in_user(pal)
    assert profile_meta(conn, writer)["entry_count"] == 3

    body = build_conn() |> log_in_user(pal) |> get("/api/users/#{writer.username}/entries?per_page=10") |> json_response(200)
    assert length(body["data"]) == 3
    assert body["pagination"]["total"] == 3
  end

  test "entries can be filtered to one month", %{writer: writer} do
    body = build_conn() |> log_in_user(writer) |> get("/api/users/#{writer.username}/entries?year=2004&month=12") |> json_response(200)
    assert body["pagination"]["total"] == 2
    body = build_conn() |> log_in_user(writer) |> get("/api/users/#{writer.username}/entries?year=2005&month=1") |> json_response(200)
    assert body["pagination"]["total"] == 1
    # Nonsense months fall back to the whole year rather than erroring.
    body = build_conn() |> log_in_user(writer) |> get("/api/users/#{writer.username}/entries?year=2004&month=13") |> json_response(200)
    assert body["pagination"]["total"] == 2
  end

  test "entry pages link to the older and newer entries the viewer can read", %{writer: writer} do
    [older, middle] =
      Journals.list_entries(writer.id, sort: "oldest", privacy: :public)

    nav =
      build_conn()
      |> get("/api/users/#{writer.username}/entries/#{middle.slug}")
      |> json_response(200)
      |> get_in(["data", "journal_nav"])

    assert nav["older"]["slug"] == older.slug
    # The newer ones are friends-only and private, so a stranger gets none.
    assert nav["newer"] == nil

    nav =
      build_conn()
      |> log_in_user(writer)
      |> get("/api/users/#{writer.username}/entries/#{middle.slug}")
      |> json_response(200)
      |> get_in(["data", "journal_nav"])

    assert nav["newer"]["published_at"] =~ "2005-01-02"
  end
end
