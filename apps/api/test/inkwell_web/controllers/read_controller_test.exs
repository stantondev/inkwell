defmodule InkwellWeb.ReadControllerTest do
  @moduledoc """
  Reader stats (2026-09-22): one read per reader per entry per day, never the
  writer's own, never bots; only daily totals are stored.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Reads, Repo}
  alias Inkwell.Accounts.User

  @browser "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15"

  defp publish(user, attrs \\ %{}) do
    n = System.unique_integer([:positive])

    {:ok, e} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "Post #{n}",
            body_html: "<p>Hello there.</p>",
            privacy: :public,
            status: :published,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )

    e
  end

  defp read(conn, entry, ip, opts \\ []) do
    conn
    |> put_req_header("x-forwarded-for", ip)
    |> put_req_header("user-agent", Keyword.get(opts, :ua, @browser))
    |> post("/api/entries/#{entry.id}/read", %{"referrer" => Keyword.get(opts, :referrer, "")})
  end

  defp total(entry), do: Map.get(Reads.counts_for_entries([entry.id]), entry.id, 0)

  setup do
    :ets.delete_all_objects(:entry_read_seen)
    :ok
  end

  test "counts each reader once per day" do
    entry = publish(create_user())
    assert read(build_conn(), entry, "203.0.113.1").status == 204
    read(build_conn(), entry, "203.0.113.1")
    read(build_conn(), entry, "203.0.113.2")
    assert total(entry) == 2
  end

  test "the writer's own reads and bots don't count" do
    writer = create_user()
    entry = publish(writer)
    build_conn() |> log_in_user(writer) |> read(entry, "203.0.113.5")
    read(build_conn(), entry, "203.0.113.6", ua: "Mastodon/4.7.2 (http.rb/5.2.0; +https://example.social/)")
    read(build_conn(), entry, "203.0.113.7", ua: "")
    assert total(entry) == 0
  end

  test "private entries only count for people who can read them" do
    entry = publish(create_user(), %{privacy: :private})
    assert read(build_conn(), entry, "203.0.113.8").status == 204
    assert total(entry) == 0
  end

  test "unknown or malformed ids answer 204 and count nothing" do
    assert build_conn() |> post("/api/entries/not-a-uuid/read", %{}) |> response(204)
    assert build_conn() |> post("/api/entries/#{Ecto.UUID.generate()}/read", %{}) |> response(204)
  end

  test "referrers are reduced to a host, search engine or Inkwell" do
    assert Reads.classify_referrer("") == ""
    assert Reads.classify_referrer("https://www.google.co.uk/search?q=x") == "search:google"
    assert Reads.classify_referrer("https://duckduckgo.com/") == "search:duckduckgo"
    assert Reads.classify_referrer("https://inkwell.social/explore") == "inkwell"
    assert Reads.classify_referrer("https://t.co/abc") == "x.com"
    assert Reads.classify_referrer("https://www.Example.org/post?id=1") == "example.org"
    assert Reads.classify_referrer("not a url") == ""
  end

  describe "GET /api/me/reads" do
    test "free writers get totals only" do
      writer = create_user()
      entry = publish(writer)
      read(build_conn(), entry, "203.0.113.20")

      data = build_conn() |> log_in_user(writer) |> get("/api/me/reads") |> json_response(200) |> Map.fetch!("data")
      assert data["total"] == 1
      assert data["plus"] == false
      refute Map.has_key?(data, "daily")
    end

    test "Plus writers get the chart, top entries and sources" do
      writer =
        create_user()
        |> User.subscription_changeset(%{subscription_tier: "plus", subscription_status: "active"})
        |> Repo.update!()

      entry = publish(writer)
      read(build_conn(), entry, "203.0.113.30", referrer: "https://news.example.com/links")
      read(build_conn(), entry, "203.0.113.31")

      data = build_conn() |> log_in_user(writer) |> get("/api/me/reads?days=7") |> json_response(200) |> Map.fetch!("data")
      assert data["plus"] == true
      assert data["total"] == 2
      assert length(data["daily"]) == 7
      assert [%{"id" => id, "reads" => 2}] = data["top_entries"]
      assert id == entry.id
      assert Enum.sort(Enum.map(data["referrers"], & &1["source"])) == ["", "news.example.com"]
    end

    test "another writer's reads are not included" do
      mine = create_user()
      other = publish(create_user())
      read(build_conn(), other, "203.0.113.40")
      data = build_conn() |> log_in_user(mine) |> get("/api/me/reads") |> json_response(200) |> Map.fetch!("data")
      assert data["total"] == 0
    end
  end
end
