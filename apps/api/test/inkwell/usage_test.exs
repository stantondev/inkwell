defmodule Inkwell.UsageTest do
  @moduledoc """
  Feature usage (Inkwell.Usage): counting who uses which feature, once a day,
  without keeping anything that identifies a signed-out visitor; and the
  report behind Admin → Usage.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo, Usage}
  alias Inkwell.Usage.Catalog

  @ua "Mozilla/5.0 (Macintosh) Safari/605"

  defp day_rows(feature) do
    %{rows: rows} =
      Repo.query!(
        "SELECT action, detail, members, visitors, uses FROM feature_use_days WHERE feature = $1 ORDER BY action, detail",
        [feature]
      )

    rows
  end

  defp member_rows(feature) do
    %{rows: rows} = Repo.query!("SELECT days_used FROM feature_members WHERE feature = $1", [feature])
    rows
  end

  defp feature(report, key), do: Enum.find(report.features, &(&1.key == key))

  test "the web app's FEATURES list is exactly the tracked features in the catalog" do
    source = File.read!(Path.expand("../../../web/src/lib/usage.ts", __DIR__))
    [_, list] = Regex.run(~r/export const FEATURES = \[(.*?)\] as const/s, source)
    web = Regex.scan(~r/"([a-z0-9_]+)"/, list) |> Enum.map(&List.last/1)

    assert Enum.sort(web) == Enum.sort(Catalog.tracked_keys())
    assert web == Enum.uniq(web)
  end

  test "every catalog key is unique and every group exists" do
    keys = Enum.map(Catalog.all(), & &1.key)
    assert keys == Enum.uniq(keys)
    groups = Enum.map(Catalog.groups(), &elem(&1, 0))
    assert Enum.all?(Catalog.all(), &(&1.group in groups))
  end

  test "a member counts once a day however often they use it" do
    user = create_user()

    assert :counted = Usage.record("gazette", user, "1.2.3.4", @ua)
    assert :counted = Usage.record("gazette", user, "5.6.7.8", @ua)

    assert [["", "", 1, 0, 2]] = day_rows("gazette")
    assert [[1]] = member_rows("gazette")
  end

  test "signed-out visitors count once a day per browser, and bots not at all" do
    Usage.record("gazette", nil, "1.2.3.4", @ua)
    Usage.record("gazette", nil, "1.2.3.4", @ua)
    Usage.record("gazette", nil, "9.9.9.9", @ua)
    assert :skipped = Usage.record("gazette", nil, "1.2.3.4", "Googlebot/2.1")
    assert :skipped = Usage.record("gazette", nil, "1.2.3.4", nil)

    assert [["", "", 0, 2, 3]] = day_rows("gazette")
    # Nothing about visitors is kept beyond the counts.
    assert %{rows: [[0]]} = Repo.query!("SELECT count(*) FROM feature_members")
  end

  test "only tracked features, known actions and allowed details are recorded" do
    user = create_user()

    assert :skipped = Usage.record("no_such_feature", user, "1.2.3.4", @ua)
    # Counted from the database already
    assert :skipped = Usage.record("stamps", user, "1.2.3.4", @ua)
    assert :skipped = Usage.record("gazette", user, "1.2.3.4", @ua, action: "opened")
    assert :skipped = Usage.record("gazette", user, "1.2.3.4", @ua, detail: "impossible")
    assert :skipped = Usage.record("gazette", user, "1.2.3.4", @ua, action: %{"x" => 1})

    assert %{rows: [[0]]} = Repo.query!("SELECT count(*) FROM feature_use_days")
  end

  test "admins aren't counted" do
    admin = create_user()
    Application.put_env(:inkwell, :admin_usernames, [admin.username])
    on_exit(fn -> Application.put_env(:inkwell, :admin_usernames, []) end)

    assert :skipped = Usage.record("gazette", admin, "1.2.3.4", @ua)
    assert :skipped = Usage.record_member("arrange", admin)
    assert [] = day_rows("gazette")
  end

  test "server-side recording: saving the arranged page counts as using Arrange" do
    user = create_user()

    build_conn()
    |> log_in_user(user)
    |> put("/api/me/home", %{"home" => %{"version" => 1, "sections" => []}})
    |> json_response(200)

    assert [[1]] = member_rows("arrange")
  end

  test "POST /api/usage always answers 204 and counts the signed-in member" do
    user = create_user()

    conn =
      build_conn()
      |> log_in_user(user)
      |> put_req_header("user-agent", @ua)
      |> post("/api/usage", %{"feature" => "stamp_album"})

    assert response(conn, 204)

    assert response(build_conn() |> post("/api/usage", %{"feature" => "nope"}), 204)
    assert response(build_conn() |> post("/api/usage", %{}), 204)

    assert [["", "", 1, 0, 1]] = day_rows("stamp_album")
  end

  describe "report/1" do
    test "counts people from the database, leaving out suspended accounts" do
      writer = create_user()
      other = create_user()
      spammer = create_user()

      for u <- [writer, other, spammer] do
        {:ok, _} =
          Journals.create_entry(%{
            user_id: u.id, title: "Hi #{u.username}", body_html: "<p>hello there</p>",
            privacy: :public, status: :published, published_at: DateTime.utc_now(), kind: "sticky"
          })
      end

      spammer
      |> Ecto.Changeset.change(blocked_at: DateTime.utc_now() |> DateTime.truncate(:microsecond))
      |> Repo.update!()

      f = feature(Usage.report(), "stickies")
      assert f.people_7 == 2
      assert f.people_ever == 2
      assert List.last(f.trend) == 2
      assert length(f.trend) == 12
    end

    test "tracked features report members and visitor-days" do
      user = create_user()
      Usage.record("gazette", user, "1.2.3.4", @ua)
      Usage.record("gazette", nil, "2.2.2.2", @ua)

      f = feature(Usage.report(), "gazette")
      assert f.people_30 == 1
      assert f.visitor_days_30 == 1
      assert [%{username: _}] = f.members
    end

    test "status: almost nobody for 90 days is a retirement candidate; new features aren't judged" do
      today = Date.utc_today()
      old = %{how: :db, core: false, added: nil, people_90: 1, people_prev_90: 0}

      assert Usage.status(old, today) == "retire"
      assert Usage.status(%{old | people_90: 4}, today) == "quiet"
      assert Usage.status(%{old | people_90: 30}, today) == "used"
      assert Usage.status(%{old | added: Date.add(today, -10)}, today) == "new"
      assert Usage.status(%{old | core: true}, today) == "used"

      tracked = %{how: :tracked, core: false, added: nil, people_90: 0, visitor_days_90: 0}
      assert Usage.status(tracked, Catalog.tracking_started()) == "counting"
      assert Usage.status(tracked, Date.add(Catalog.tracking_started(), 120)) == "retire"
    end
  end
end
