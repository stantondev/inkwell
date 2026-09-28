defmodule InkwellWeb.SelfHostedInstanceTest do
  @moduledoc """
  A self-hosted server (INKWELL_SELF_HOSTED=true at journal.example.org) must
  be itself everywhere: its own fediverse handles and ids, its own contact
  address, no inkwell.social payments, and no sign-in links in responses.
  Until 2026-09-28 none of this held, and nobody could self-host Inkwell.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Accounts, Instance, Journals}

  @keys [:self_hosted, :frontend_url, :api_url, :federation, :feedback_email, :instance_name, :from_email, :admin_emails, :on_fly]

  setup do
    saved = for key <- @keys, do: {key, Application.fetch_env(:inkwell, key)}

    on_exit(fn ->
      for {key, value} <- saved do
        case value do
          {:ok, v} -> Application.put_env(:inkwell, key, v)
          :error -> Application.delete_env(:inkwell, key)
        end
      end
    end)

    :ok
  end

  defp self_host(extra \\ []) do
    Application.put_env(:inkwell, :self_hosted, true)
    Application.put_env(:inkwell, :frontend_url, "https://journal.example.org")
    Application.put_env(:inkwell, :api_url, "https://journal.example.org")
    Application.put_env(:inkwell, :federation, instance_host: "journal.example.org", frontend_host: "https://journal.example.org")
    Application.put_env(:inkwell, :feedback_email, "owner@example.org")
    Application.put_env(:inkwell, :instance_name, "Example Journal")
    Application.put_env(:inkwell, :from_email, "Example Journal <noreply@journal.example.org>")
    Application.put_env(:inkwell, :on_fly, false)
    for {k, v} <- extra, do: Application.put_env(:inkwell, k, v)
  end

  describe "Inkwell.Instance" do
    test "on inkwell.social (and in tests) the old inkwell.social hosts still count as ours" do
      assert Instance.local_url?("https://inkwell.social/comments/1")
      assert Instance.local_url?("https://inkwell-api.fly.dev/entries/1")
    end

    test "a self-hosted server doesn't mistake inkwell.social for itself" do
      self_host()

      assert Instance.local_url?("https://journal.example.org/users/alice")
      refute Instance.local_url?("https://inkwell.social/comments/1")
      refute Inkwell.Letters.Federation.local_url?("https://inkwell.social/entries/abc")
      assert Instance.name() == "Example Journal"
      assert Instance.contact_email() == "owner@example.org"
      assert Instance.from_address() == "noreply@journal.example.org"
    end
  end

  describe "fediverse identity" do
    test "WebFinger answers for the site's own domain", %{conn: conn} do
      self_host()
      user = create_user(username: "alice_sh")

      body =
        conn
        |> get("/.well-known/webfinger?resource=acct:alice_sh@journal.example.org")
        |> json_response(200)

      assert body["subject"] == "acct:alice_sh@journal.example.org"
      assert Enum.any?(body["links"], &(&1["href"] == "https://journal.example.org/users/#{user.username}"))

      # ...and not for inkwell.social, which is a different server.
      assert build_conn()
             |> get("/.well-known/webfinger?resource=acct:alice_sh@inkwell.social")
             |> json_response(404)
    end

    test "new entries and accounts store ids on the site's own host" do
      self_host()
      user = create_user()
      assert user.ap_id == "https://journal.example.org/users/#{user.username}"

      {:ok, entry} =
        Journals.create_entry(%{
          user_id: user.id,
          title: "Hello",
          body_html: "<p>Hi</p>",
          privacy: :public,
          status: :published,
          published_at: DateTime.utc_now()
        })

      assert entry.ap_id == "https://journal.example.org/entries/#{entry.id}"
    end

    test "NodeInfo uses the instance name", %{conn: conn} do
      self_host()
      body = conn |> get("/nodeinfo/2.1") |> json_response(200)
      assert body["metadata"]["nodeName"] == "Example Journal"
    end
  end

  describe "sign-in" do
    test "never hands the sign-in link back when no email is set up", %{conn: conn} do
      self_host()

      body =
        conn
        |> post("/api/auth/magic-link", %{email: "reader@example.org", terms_accepted: true})
        |> json_response(200)

      assert body["ok"] == true
      refute Map.has_key?(body, "dev_magic_link")
    end

    test "local development still shows the link", %{conn: conn} do
      body =
        conn
        |> post("/api/auth/magic-link", %{email: "dev@example.org", terms_accepted: true})
        |> json_response(200)

      assert is_binary(body["dev_magic_link"])
    end

    test "an address in ADMIN_EMAILS is an admin from the first sign-in" do
      self_host(admin_emails: ["owner@example.org"])
      owner = create_user(email: "Owner@Example.org")
      someone = create_user()

      assert Accounts.is_admin?(owner)
      assert Accounts.is_env_admin?(owner)
      refute Accounts.is_admin?(someone)
      assert owner.id in Enum.map(Accounts.list_admins(), & &1.id)
    end
  end

  describe "no inkwell.social business on a self-hosted server" do
    test "checkout, trials and Founding are refused", %{conn: conn} do
      self_host()
      user = create_user()

      for path <- ~w(/api/billing/checkout /api/billing/start-trial /api/billing/founding-checkout /api/billing/donate) do
        assert conn |> recycle() |> log_in_user(user) |> post(path, %{}) |> json_response(404),
               "#{path} should be refused"
      end
    end

    test "billing status says self-hosted and offers no trial", %{conn: conn} do
      self_host()
      user = create_user()
      body = conn |> log_in_user(user) |> get("/api/billing/status") |> json_response(200) |> Map.fetch!("data")
      assert body["self_hosted"] == true
      assert body["trial_eligible"] == false
    end

    test "the transparency figures are inkwell.social's, so they aren't served", %{conn: conn} do
      self_host()
      assert conn |> get("/api/transparency") |> json_response(404)
    end

    test "custom domains are refused (they need Fly's certificates)", %{conn: conn} do
      self_host()
      user = create_user()

      assert conn
             |> log_in_user(user)
             |> post("/api/custom-domain", %{domain: "writer.example.net"})
             |> json_response(404)
    end

    test "Post by Email is off unless its inbound mail is configured", %{conn: conn} do
      self_host()
      user = create_user()
      refute Inkwell.PostByEmail.available?()

      assert conn |> log_in_user(user) |> post("/api/me/post-email/enable") |> json_response(503)
    end
  end

  describe "links and email" do
    test "the site's own links aren't marked nofollow; other sites' are" do
      self_host()
      html = ~s(<a href="https://journal.example.org/alice">me</a> <a href="https://inkwell.social/x">them</a>)
      out = Inkwell.HtmlSanitizer.nofollow_external_links(html)
      assert out =~ ~s(<a href="https://journal.example.org/alice">)
      assert out =~ ~s(<a rel="nofollow ugc noopener noreferrer" href="https://inkwell.social/x">)
    end
  end

  describe "rate limiting off Fly.io" do
    test "Fly's client-IP headers are ignored, since anyone could send them" do
      self_host()

      conn =
        build_conn()
        |> put_req_header("x-inkwell-client-ip", "203.0.113.7")
        |> put_req_header("fly-client-ip", "172.19.0.2")
        |> put_req_header("x-forwarded-for", "198.51.100.4")

      assert InkwellWeb.Plugs.RateLimit.client_ip(conn) == "198.51.100.4"
    end
  end
end
