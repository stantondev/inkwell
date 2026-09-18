defmodule InkwellWeb.NodeinfoTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.CustomDomains.CustomDomain
  alias Inkwell.Journals.{Comment, Entry}
  alias Inkwell.Repo
  alias InkwellWeb.FederationController

  @routes ["/.well-known/nodeinfo", "/nodeinfo/2.0", "/nodeinfo/2.1"]

  defp add_custom_domain(domain, status \\ "active") do
    owner = create_user()
    Repo.insert!(%CustomDomain{domain: domain, user_id: owner.id, status: status})
    owner
  end

  defp entry(user, status) do
    Repo.insert!(%Entry{
      user_id: user.id,
      title: "t",
      body_html: "<p>hi</p>",
      status: status,
      privacy: :public,
      slug: "s-#{System.unique_integer([:positive])}"
    })
  end

  describe "custom domains" do
    test "every NodeInfo route 404s on a member's custom domain", %{conn: conn} do
      add_custom_domain("henshaw.test")

      for path <- @routes do
        assert conn
               |> put_req_header("x-original-host", "henshaw.test")
               |> get(path)
               |> json_response(404) == %{"error" => "not_found"}
      end
    end

    test "port, case and non-active status still count as the custom domain", %{conn: conn} do
      add_custom_domain("old-blog.test", "removed")

      assert conn
             |> put_req_header("x-original-host", "Old-Blog.test:443")
             |> get("/nodeinfo/2.1")
             |> json_response(404)
    end

    test "the instance's own host, and requests without the header, still answer", %{conn: conn} do
      add_custom_domain("henshaw.test")

      for path <- @routes do
        assert build_conn() |> get(path) |> json_response(200)

        assert build_conn()
               |> put_req_header("x-original-host", "inkwell.test")
               |> get(path)
               |> json_response(200)
      end

      # Discovery still points crawlers at the canonical host.
      links = conn |> get("/.well-known/nodeinfo") |> json_response(200) |> Map.fetch!("links")
      assert Enum.all?(links, &String.starts_with?(&1["href"], "https://inkwell.test/nodeinfo/"))
    end

    test "WebFinger keeps working on a custom domain (profiles found through it stay reachable)", %{conn: conn} do
      owner = add_custom_domain("henshaw.test")

      body =
        conn
        |> put_req_header("x-original-host", "henshaw.test")
        |> get("/.well-known/webfinger", %{resource: "acct:#{owner.username}@inkwell.test"})
        |> json_response(200)

      assert body["subject"] == "acct:#{owner.username}@inkwell.test"
    end
  end

  describe "FEP-0151 metadata" do
    test "names the server, describes it, lists staff and says federation is on", %{conn: conn} do
      admin = create_user()
      admin |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

      for path <- ["/nodeinfo/2.0", "/nodeinfo/2.1"] do
        meta = build_conn() |> get(path) |> json_response(200) |> Map.fetch!("metadata")

        assert meta["nodeName"] == "Inkwell"
        assert is_binary(meta["nodeDescription"]) and meta["nodeDescription"] != ""
        assert "https://inkwell.test/users/#{admin.username}" in meta["staffAccounts"]
        assert meta["federation"] == %{"enabled" => true}
      end

      assert conn |> get("/nodeinfo/2.1") |> json_response(200) |> get_in(["usage", "users", "total"])
    end
  end

  describe "usage statistics count real members and real writing" do
    test "suspended accounts, the relay actor, drafts, hidden entries and fediverse replies are left out" do
      before = FederationController.compute_nodeinfo_stats()

      writer = create_user()
      spammer = create_user()
      create_user(%{username: "relay"})

      published = entry(writer, :published)
      entry(writer, :draft)
      entry(writer, :hidden)
      entry(spammer, :published)
      spammer |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

      Repo.insert!(%Comment{entry_id: published.id, user_id: writer.id, body_html: "<p>local</p>"})

      Repo.insert!(%Comment{
        entry_id: published.id,
        body_html: "<p>from mastodon</p>",
        remote_author: %{"username" => "someone", "domain" => "mastodon.test"}
      })

      after_ = FederationController.compute_nodeinfo_stats()

      assert after_.users.total - before.users.total == 1
      assert after_.localPosts - before.localPosts == 1
      assert after_.localComments - before.localComments == 1
      assert after_.users.activeMonth - before.users.activeMonth == 1
    end
  end
end
