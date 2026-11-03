defmodule InkwellWeb.BlueskyAuthTest do
  @moduledoc """
  Sign in with Bluesky, linking, and sharing entries, against a fake
  AT Protocol world (DID directory, PDS, authorization server, AppView)
  served by Req.Test. Checks the parts the spec makes mandatory: PAR with
  PKCE S256, DPoP with server nonces, a client assertion signed with our
  key, the `iss` and `sub` checks, and a fresh re-resolution of the DID.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Bluesky, Repo}
  alias Inkwell.Bluesky.{Account, Keys, Poster}
  alias Inkwell.Moderation.{RequestGate, Vouch}

  @did "did:plc:abcdefghijklmnopqrstuvwx"
  @other_did "did:plc:zyxwvutsrqponmlkjihgfedc"
  @issuer "https://auth.test"

  setup do
    key = Keys.generate_client_key()
    Application.put_env(:inkwell, :atproto_client_key, key)
    Application.put_env(:inkwell, :bluesky_signin, "on")
    # Bluesky's own picker (no handle typed) starts at our fake PDS.
    Application.put_env(:inkwell, :bluesky_entryway, "https://pds.test")
    :ets.delete_all_objects(:rate_limit_buckets)
    Process.put({:bluesky_dns, "_atproto.alice.test"}, ["did=" <> @did])

    on_exit(fn ->
      Application.delete_env(:inkwell, :atproto_client_key)
      Application.delete_env(:inkwell, :bluesky_signin)
      Application.delete_env(:inkwell, :bluesky_entryway)
    end)

    # What the fake servers do can be changed per test via the process
    # dictionary; requests are reported back to the test process.
    test_pid = self()
    Process.put(:bsky_profile, profile())
    Process.put(:bsky_sub, @did)

    Req.Test.stub(Inkwell.Bluesky, fn conn -> fake_world(conn, test_pid) end)
    :ok
  end

  defp profile(overrides \\ %{}) do
    Map.merge(
      %{
        "did" => @did,
        "handle" => "alice.test",
        "displayName" => "Alice",
        "description" => "I write about birds.",
        "createdAt" => "2024-01-01T00:00:00Z",
        "postsCount" => 400,
        "followersCount" => 80
      },
      overrides
    )
  end

  # ── The fake AT Protocol world ─────────────────────────────────────

  defp fake_world(conn, test_pid) do
    {:ok, raw, conn} = Plug.Conn.read_body(conn)
    params = if raw != "" and String.contains?(Plug.Conn.get_req_header(conn, "content-type") |> List.first() || "", "form"), do: URI.decode_query(raw), else: %{}
    send(test_pid, {:req, conn.method, conn.host, conn.request_path, params, conn.req_headers, raw})
    state = Process.get(:bsky_state, %{})

    case {conn.host, conn.request_path} do
      {"plc.directory", "/" <> did} ->
        Req.Test.json(conn, did_doc(did))

      {"pds.test", "/.well-known/oauth-protected-resource"} ->
        Req.Test.json(conn, %{"authorization_servers" => [@issuer]})

      {"evilpds.test", "/.well-known/oauth-protected-resource"} ->
        Req.Test.json(conn, %{"authorization_servers" => ["https://evil.test"]})

      {"auth.test", "/.well-known/oauth-authorization-server"} ->
        Req.Test.json(conn, %{
          "issuer" => @issuer,
          "pushed_authorization_request_endpoint" => @issuer <> "/oauth/par",
          "authorization_endpoint" => @issuer <> "/oauth/authorize",
          "token_endpoint" => @issuer <> "/oauth/token"
        })

      {"auth.test", "/oauth/par"} ->
        with_nonce(conn, fn conn ->
          conn |> Plug.Conn.put_status(201) |> Req.Test.json(%{"request_uri" => "urn:ietf:params:oauth:request_uri:req-1", "expires_in" => 300})
        end)

      {"auth.test", "/oauth/token"} ->
        with_nonce(conn, fn conn ->
          scope = Map.get(state, :scope, "atproto")

          Req.Test.json(conn, %{
            "access_token" => "access-" <> Integer.to_string(System.unique_integer([:positive])),
            "refresh_token" => "refresh-" <> Integer.to_string(System.unique_integer([:positive])),
            "token_type" => "DPoP",
            "expires_in" => 1800,
            "scope" => scope,
            "sub" => Process.get(:bsky_sub)
          })
        end)

      {"public.api.bsky.app", "/xrpc/app.bsky.actor.getProfile"} ->
        Req.Test.json(conn, Process.get(:bsky_profile))

      {"pds.test", "/xrpc/com.atproto.repo.uploadBlob"} ->
        Req.Test.json(conn, %{"blob" => %{"$type" => "blob", "ref" => %{"$link" => "bafy"}, "mimeType" => "image/png", "size" => 10}})

      {"pds.test", "/xrpc/com.atproto.repo.createRecord"} ->
        Req.Test.json(conn, %{"uri" => "at://#{@did}/app.bsky.feed.post/3kpost", "cid" => "bafycid"})

      {"inkwell.test", "/api/og/entry/" <> _} ->
        png = <<137, 80, 78, 71, 13, 10, 26, 10>> <> :binary.copy(<<0>>, 64)
        conn |> Plug.Conn.put_resp_content_type("image/png") |> Plug.Conn.send_resp(200, png)

      _ ->
        Plug.Conn.send_resp(conn, 404, "not found")
    end
  end

  # The first request to a server must come back for a nonce.
  defp with_nonce(conn, fun) do
    proof = conn |> Plug.Conn.get_req_header("dpop") |> List.first()
    {:ok, claims} = proof |> JOSE.JWT.peek_payload() |> then(&{:ok, &1.fields})

    if claims["nonce"] == "n1" do
      conn |> Plug.Conn.put_resp_header("dpop-nonce", "n1") |> fun.()
    else
      conn
      |> Plug.Conn.put_resp_header("dpop-nonce", "n1")
      |> Plug.Conn.put_status(400)
      |> Req.Test.json(%{"error" => "use_dpop_nonce"})
    end
  end

  defp did_doc(@other_did) do
    %{
      "id" => @other_did,
      "alsoKnownAs" => ["at://mallory.test"],
      "service" => [%{"id" => "#atproto_pds", "type" => "AtprotoPersonalDataServer", "serviceEndpoint" => "https://evilpds.test"}]
    }
  end

  defp did_doc(did) do
    %{
      "id" => did,
      "alsoKnownAs" => ["at://alice.test"],
      "service" => [%{"id" => "#atproto_pds", "type" => "AtprotoPersonalDataServer", "serviceEndpoint" => "https://pds.test"}]
    }
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp start_sign_in(conn \\ build_conn(), path \\ "/api/auth/bluesky/initiate", body \\ %{"handle" => "@Alice.test"}) do
    resp = conn |> post(path, body) |> json_response(200)
    assert resp["authorize_url"] =~ "https://auth.test/oauth/authorize?"
    assert resp["authorize_url"] =~ "request_uri="
    par_params()
  end

  defp par_params do
    collect = fn collect, acc ->
      receive do
        {:req, "POST", "auth.test", "/oauth/par", params, headers, _} -> collect.(collect, [{params, headers} | acc])
        {:req, _, _, _, _, _, _} -> collect.(collect, acc)
      after
        0 -> acc
      end
    end

    collect.(collect, []) |> List.first()
  end

  defp finish(state, iss \\ @issuer) do
    build_conn() |> post("/api/auth/bluesky/callback", %{"code" => "code-1", "state" => state, "iss" => iss})
  end

  # ── Tests ──────────────────────────────────────────────────────────

  test "client metadata is what the spec requires" do
    meta = build_conn() |> get("/api/auth/bluesky/client-metadata") |> json_response(200)

    assert meta["client_id"] == "https://inkwell.test/oauth/bluesky/client-metadata.json"
    assert meta["redirect_uris"] == ["https://inkwell.test/auth/bluesky/callback"]
    assert meta["dpop_bound_access_tokens"] == true
    assert meta["token_endpoint_auth_method"] == "private_key_jwt"
    assert "authorization_code" in meta["grant_types"] and "refresh_token" in meta["grant_types"]
    assert "atproto" in String.split(meta["scope"])
    [key] = meta["jwks"]["keys"]
    assert key["kty"] == "EC" and is_binary(key["kid"]) and is_nil(key["d"])
  end

  test "a new member signs up with Bluesky: PAR, PKCE, DPoP nonces, client assertion, verified sub" do
    {params, headers} = start_sign_in()

    # PAR: PKCE S256, scope only atproto, our client, signed assertion.
    assert params["code_challenge_method"] == "S256"
    assert params["scope"] == "atproto"
    assert params["login_hint"] == "alice.test"
    assert params["client_id"] == "https://inkwell.test/oauth/bluesky/client-metadata.json"
    assert params["client_assertion_type"] == "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

    {_, public} = Keys.client_key() |> JOSE.JWK.to_public() |> JOSE.JWK.to_map()
    assert {true, jwt, _} = JOSE.JWT.verify_strict(JOSE.JWK.from_map(public), ["ES256"], params["client_assertion"])
    assert jwt.fields["aud"] == @issuer
    assert jwt.fields["iss"] == params["client_id"]

    # The retried PAR carried the server's nonce in its DPoP proof.
    proof = :proplists.get_value("dpop", headers)
    assert JOSE.JWT.peek_payload(proof).fields["nonce"] == "n1"
    assert JOSE.JWT.peek_payload(proof).fields["htu"] == "https://auth.test/oauth/par"

    body = finish(params["state"]) |> json_response(200)
    assert body["is_new"] == true
    assert body["redirect_to"] == "/welcome"
    assert is_binary(body["token"])

    account = Bluesky.get_by_did(@did)
    user = Inkwell.Accounts.get_user!(account.user_id)
    assert user.email == "did-plc-abcdefghijklmnopqrstuvwx@bluesky.fediverse.inkwell.social"
    assert user.username == "alice"
    assert user.display_name == "Alice"
    assert user.bio == "I write about birds."
    assert user.terms_accepted_at
    assert account.handle == "alice.test"
    assert account.posts_count == 400
    refute Account.can_post?(account)

    # Tokens are stored encrypted, never in the clear.
    refute account.session =~ "access-"
    assert {:ok, %{"access_token" => "access-" <> _, "dpop_key" => %{"d" => _}}} = Keys.decrypt(account.session)

    # Months old with posts and followers: skips new-account holds.
    assert user.vouched_at
    assert user.vouched_via == "bluesky"
    refute RequestGate.new_account?(user)
  end

  test "signing in again returns the same member" do
    {params, _} = start_sign_in()
    finish(params["state"]) |> json_response(200)
    {params, _} = start_sign_in()
    body = finish(params["state"]) |> json_response(200)

    assert body["is_new"] == false
    assert Repo.aggregate(Account, :count) == 1
  end

  test "a state can only be used once" do
    {params, _} = start_sign_in()
    finish(params["state"]) |> json_response(200)
    assert finish(params["state"]) |> json_response(401)
  end

  test "the authorization server must be the one we started with (iss)" do
    {params, _} = start_sign_in()
    assert finish(params["state"], "https://evil.test") |> json_response(401)
    assert Bluesky.get_by_did(@did) == nil
  end

  test "a sub whose PDS belongs to another authorization server is refused" do
    # Started without a handle (Bluesky's own picker), so the server tells
    # us who signed in; we must check it ourselves.
    Process.put(:bsky_sub, @other_did)

    {params, _} = start_sign_in(build_conn(), "/api/auth/bluesky/initiate", %{"handle" => ""})
    refute Map.has_key?(params, "login_hint")
    assert finish(params["state"]) |> json_response(401)
    assert Bluesky.get_by_did(@other_did) == nil
  end

  test "a young or quiet account isn't vouched for" do
    Process.put(:bsky_profile, profile(%{"createdAt" => DateTime.utc_now() |> DateTime.to_iso8601(), "postsCount" => 3}))
    {params, _} = start_sign_in()
    finish(params["state"]) |> json_response(200)

    user = Inkwell.Accounts.get_user!(Bluesky.get_by_did(@did).user_id)
    refute user.vouched_at
    assert RequestGate.new_account?(user)
  end

  test "an existing member links Bluesky from Settings, and turns on sharing" do
    user = create_user()
    conn = build_conn() |> log_in_user(user)

    {params, _} = start_sign_in(conn, "/api/auth/bluesky/link", %{})
    assert params["scope"] == "atproto"
    body = finish(params["state"]) |> json_response(200)
    assert body["linked"] == true

    account = Bluesky.get_for_user(user.id)
    assert account.did == @did

    # Asking for sharing re-authorizes with the posting scope.
    Process.put(:bsky_state, %{scope: "atproto transition:generic"})
    {params, _} = start_sign_in(build_conn() |> log_in_user(user), "/api/auth/bluesky/link", %{"posting" => true})
    assert params["scope"] == "atproto transition:generic"
    finish(params["state"]) |> json_response(200)
    assert Account.can_post?(Bluesky.get_for_user(user.id))

    # It shows up in the editor's Cross-post list.
    accounts = build_conn() |> log_in_user(user) |> get("/api/auth/fediverse/accounts") |> json_response(200)
    assert [%{"kind" => "bluesky", "remote_acct" => "alice.test", "token_scope" => "write"}] = accounts["data"]
  end

  test "an account linked to someone else can't be linked again" do
    {params, _} = start_sign_in()
    finish(params["state"]) |> json_response(200)

    other = create_user()
    {params, _} = start_sign_in(build_conn() |> log_in_user(other), "/api/auth/bluesky/link", %{"handle" => "alice.test"})
    assert finish(params["state"]) |> json_response(409)
  end

  test "sign-in can be switched off, or kept to admins while testing" do
    Application.put_env(:inkwell, :bluesky_signin, "admins")
    assert build_conn() |> post("/api/auth/bluesky/initiate", %{"handle" => "alice.test"}) |> json_response(404)

    user = create_user()
    assert build_conn() |> log_in_user(user) |> post("/api/auth/bluesky/link", %{}) |> json_response(404)
  end

  test "a member who signed up with Bluesky can't unlink it without an email" do
    {params, _} = start_sign_in()
    body = finish(params["state"]) |> json_response(200)
    conn = build_conn() |> put_req_header("authorization", "Bearer " <> body["token"])
    assert conn |> delete("/api/auth/bluesky/account") |> json_response(422)
  end

  describe "sharing an entry" do
    setup do
      user = create_user()
      Process.put(:bsky_state, %{scope: "atproto transition:generic"})
      {params, _} = start_sign_in(build_conn() |> log_in_user(user), "/api/auth/bluesky/link", %{"posting" => true})
      finish(params["state"]) |> json_response(200)
      flush()
      %{user: user, account: Bluesky.get_for_user(user.id)}
    end

    test "publishing with Bluesky ticked posts a card, with the token bound to the session key", %{user: user, account: account} do
      {:ok, entry} =
        Inkwell.Journals.create_entry(%{
          "user_id" => user.id,
          "title" => "Birds in November",
          "body_html" => "<p>The starlings came back today and the whole sky turned over.</p>",
          "privacy" => "public",
          "tags" => ["birds", "autumn"]
        })

      InkwellWeb.EntryPublishing.after_publish(entry, user, %{"crosspost_to" => [account.id]})

      assert_received {:req, "POST", "pds.test", "/xrpc/com.atproto.repo.uploadBlob", _, _, _}
      assert_received {:req, "POST", "pds.test", "/xrpc/com.atproto.repo.createRecord", _, headers, raw}

      assert "DPoP " <> token = :proplists.get_value("authorization", headers)
      proof = JOSE.JWT.peek_payload(:proplists.get_value("dpop", headers)).fields
      assert proof["ath"] == :crypto.hash(:sha256, token) |> Base.url_encode64(padding: false)

      record = Jason.decode!(raw)["record"]
      assert record["$type"] == "app.bsky.feed.post"
      assert record["text"] =~ "Birds in November"
      assert String.length(record["text"]) <= 300
      assert record["embed"]["external"]["uri"] =~ "https://inkwell.test/#{user.username}/"
      assert record["embed"]["external"]["thumb"]["mimeType"] == "image/png"

      results = Repo.get!(Inkwell.Journals.Entry, entry.id).crosspost_results
      assert results[account.id]["url"] == "https://bsky.app/profile/alice.test/post/3kpost"
    end

    test "an expired token is refreshed first, and the new refresh token kept", %{user: user, account: account} do
      {:ok, %{"refresh_token" => old_refresh}} = Keys.decrypt(account.session)
      account |> Ecto.Changeset.change(access_expires_at: DateTime.add(DateTime.utc_now(), -10)) |> Repo.update!()

      {:ok, entry} =
        Inkwell.Journals.create_entry(%{"user_id" => user.id, "title" => "Hi", "body_html" => "<p>Hello</p>", "privacy" => "public"})

      InkwellWeb.EntryPublishing.after_publish(entry, user, %{"crosspost_to" => [account.id]})

      assert_received {:req, "POST", "auth.test", "/oauth/token", %{"grant_type" => "refresh_token", "refresh_token" => ^old_refresh}, _, _}
      {:ok, %{"refresh_token" => new_refresh}} = Keys.decrypt(Bluesky.get(account.id).session)
      assert new_refresh != old_refresh
    end

    test "private entries aren't shared", %{user: user, account: account} do
      {:ok, entry} =
        Inkwell.Journals.create_entry(%{"user_id" => user.id, "title" => "Mine", "body_html" => "<p>x</p>", "privacy" => "private"})

      InkwellWeb.EntryPublishing.after_publish(entry, user, %{"crosspost_to" => [account.id]})
      refute_received {:req, "POST", "pds.test", "/xrpc/com.atproto.repo.createRecord", _, _, _}
    end
  end

  describe "the post text" do
    defp entry(attrs) do
      struct(Inkwell.Journals.Entry, Map.merge(%{title: nil, excerpt: nil, body_html: "", tags: [], sensitive: false, admin_sensitive: false, content_warning: nil}, attrs))
    end

    test "fits in 300 characters and hashtag facets point at the right bytes" do
      long = String.duplicate("Ünïcödé words 🌿 ", 60)
      {text, facets} = Poster.build_text(entry(%{title: "Café notes 🌿", excerpt: long, tags: ["birds", "café"]}))

      assert String.length(text) <= 300
      assert String.ends_with?(text, "#birds #café")

      for %{"index" => %{"byteStart" => s, "byteEnd" => e}, "features" => [%{"tag" => tag}]} <- facets do
        assert binary_part(text, s, e - s) == "#" <> tag
      end

      assert length(facets) == 2
    end

    test "a content warning hides the opening lines" do
      {text, _} = Poster.build_text(entry(%{title: "Hard week", excerpt: "Details here", sensitive: true, content_warning: "grief"}))
      assert text == "Hard week\n\nContent warning: grief"
    end
  end

  test "the vouch rule" do
    old = DateTime.add(DateTime.utc_now(), -200, :day)
    assert Vouch.qualifies?(%{created_at: old, posts: 25, followers: 12})
    refute Vouch.qualifies?(%{created_at: old, posts: 5, followers: 12})
    refute Vouch.qualifies?(%{created_at: DateTime.utc_now(), posts: 500, followers: 500})
    refute Vouch.qualifies?(%{created_at: nil, posts: 500, followers: 500})
    assert Vouch.qualifies?(%{created_at: "2020-05-01T10:00:00.000Z", posts: 25, followers: 12})
  end

  defp flush do
    receive do
      _ -> flush()
    after
      0 -> :ok
    end
  end
end
