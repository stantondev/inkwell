defmodule Inkwell.GrowthTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Accounts
  alias Inkwell.Growth
  alias Inkwell.Repo

  setup do
    if :ets.whereis(:rate_limit_buckets) != :undefined do
      :ets.delete_all_objects(:rate_limit_buckets)
    end

    :ok
  end

  defp admin, do: create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

  describe "sanitize_attribution/1" do
    test "keeps a clean host, ref and path" do
      assert Growth.sanitize_attribution(%{
               "host" => "WWW.Reddit.com",
               "ref" => "Reddit-Substack!!",
               "path" => "/switch/substack?utm_source=x"
             }) == %{
               signup_referrer_host: "reddit.com",
               signup_ref: "reddit-substack",
               signup_landing_path: "/switch/substack"
             }
    end

    test "drops our own hosts, junk hosts and non-paths" do
      assert Growth.sanitize_attribution(%{"host" => "inkwell.social", "path" => "//evil.example"}) == %{}
      assert Growth.sanitize_attribution(%{"host" => "a b<script>", "path" => "https://x.y/"}) == %{}
      assert Growth.sanitize_attribution(%{"host" => 42, "ref" => "", "path" => nil}) == %{}
    end
  end

  describe "landing_key/1" do
    test "groups writer pages by writer and keeps site pages" do
      assert Growth.landing_key("/") == "/"
      assert Growth.landing_key("/switch/substack") == "/switch/substack"
      assert Growth.landing_key("/about") == "/about"
      assert Growth.landing_key("/alice") == "@alice (profile)"
      assert Growth.landing_key("/alice/my-first-post") == "@alice (entry)"
      assert Growth.landing_key("/alice/subscribe") == "@alice (subscribe page)"
      assert Growth.landing_key(nil) == nil
    end
  end

  describe "signup via magic link" do
    test "stores attribution on a new account", %{conn: conn} do
      post(conn, "/api/auth/magic-link", %{
        email: "newcomer@example.com",
        terms_accepted: true,
        attribution: %{host: "news.ycombinator.com", ref: "hn", path: "/alice/hello"}
      })
      |> json_response(200)

      u = Accounts.get_user_by_email("newcomer@example.com")
      assert u.signup_referrer_host == "news.ycombinator.com"
      assert u.signup_ref == "hn"
      assert u.signup_landing_path == "/alice/hello"
    end

    test "never changes an existing account's attribution", %{conn: conn} do
      existing = create_user(%{email: "old@example.com"})

      post(conn, "/api/auth/magic-link", %{
        email: "old@example.com",
        terms_accepted: true,
        attribution: %{host: "reddit.com"}
      })
      |> json_response(200)

      assert Repo.reload!(existing).signup_referrer_host == nil
    end

    test "garbage attribution doesn't block signup", %{conn: conn} do
      post(conn, "/api/auth/magic-link", %{
        email: "garbage@example.com",
        terms_accepted: true,
        attribution: "not a map"
      })
      |> json_response(200)

      assert Accounts.get_user_by_email("garbage@example.com")
    end

    test "record_signup_attribution is write-once" do
      u = create_user()
      {:ok, u} = Growth.record_signup_attribution(u, %{"host" => "first.example"})
      {:ok, u} = Growth.record_signup_attribution(u, %{"host" => "second.example"})
      assert Repo.reload!(u).signup_referrer_host == "first.example"
    end
  end

  describe "How did you find Inkwell? (PATCH /api/me)" do
    test "saves a valid answer and rejects unknown ones", %{conn: conn} do
      u = create_user()

      conn
      |> log_in_user(u)
      |> patch("/api/me", %{heard_from: "other", heard_from_detail: "a podcast"})
      |> json_response(200)

      u = Repo.reload!(u)
      assert u.heard_from == "other"
      assert u.heard_from_detail == "a podcast"

      res = build_conn() |> log_in_user(u) |> patch("/api/me", %{heard_from: "billboard"})
      assert res.status == 422
    end
  end

  describe "GET /api/admin/growth" do
    test "is admin-only", %{conn: conn} do
      res = conn |> log_in_user(create_user()) |> get("/api/admin/growth")
      assert res.status in [401, 403]
    end

    test "groups signups by source with conversion counts", %{conn: conn} do
      a = admin()

      paying =
        create_user()
        |> Ecto.Changeset.change(
          heard_from: "switching",
          signup_referrer_host: "reddit.com",
          subscription_tier: "plus",
          subscription_status: "active",
          settings: %{"onboarded" => true}
        )
        |> Repo.update!()

      create_user() |> Ecto.Changeset.change(heard_from: "switching") |> Repo.update!()
      spam = create_user() |> Ecto.Changeset.change(heard_from: "switching") |> Repo.update!()
      {:ok, _} = Accounts.block_user(spam)

      body = conn |> log_in_user(a) |> get("/api/admin/growth", %{days: "30"}) |> json_response(200)

      switching = Enum.find(body["by_heard_from"], &(&1["key"] == "switching"))
      # suspended accounts are left out
      assert switching["signups"] == 2
      assert switching["paying"] == 1
      assert switching["onboarded"] == 1

      reddit = Enum.find(body["by_referrer"], &(&1["key"] == "reddit.com"))
      assert reddit["paying"] == 1

      assert Enum.any?(body["recent"], &(&1["username"] == paying.username and &1["paying"]))
      refute Enum.any?(body["recent"], &(&1["username"] == spam.username))
    end
  end
end
