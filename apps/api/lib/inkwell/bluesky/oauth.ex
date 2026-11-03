defmodule Inkwell.Bluesky.OAuth do
  @moduledoc """
  "Sign in with Bluesky": the AT Protocol's OAuth profile.

  It is stricter than Mastodon's OAuth, and every part below is required by
  the spec (atproto.com/specs/oauth):

    * the client_id is a URL serving our client metadata
      (`/oauth/bluesky/client-metadata.json` on the web app);
    * the authorization request is pushed to the server first (PAR) and the
      browser only carries the `request_uri`;
    * PKCE with S256;
    * DPoP on every token and API request, with server nonces (a request
      without the latest nonce is answered with `use_dpop_nonce`; we retry
      once with the new one);
    * on inkwell.social we are a confidential client and sign a client
      assertion with `ATPROTO_CLIENT_KEY`, so sessions can last; in local
      development (no https address) the spec's `http://localhost` client
      is used instead, which works as a public client.

  Sign-in asks only for `atproto` (who you are). Sharing entries asks again
  for `atproto transition:generic`.
  """

  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.OAuth.OAuthState
  alias Inkwell.Bluesky.{Identity, Keys, Net}

  require Logger

  @state_ttl_seconds 900
  @sign_in_scope "atproto"
  @posting_scope "atproto transition:generic"
  @nonce_table :bluesky_dpop_nonces

  def sign_in_scope, do: @sign_in_scope
  def posting_scope, do: @posting_scope
  def all_scopes, do: @posting_scope

  # ── Client identity ────────────────────────────────────────────────

  @doc "True when this server can run the confidential client (https address + client key)."
  def confidential? do
    String.starts_with?(Inkwell.Instance.frontend_url(), "https://") and Keys.client_key() != nil
  end

  @doc "Whether Bluesky sign-in can work here at all."
  def available? do
    confidential?() or local_dev?()
  end

  defp local_dev?, do: String.starts_with?(Inkwell.Instance.frontend_url(), "http://localhost")

  def client_id do
    if confidential?() do
      Inkwell.Instance.frontend_url() <> "/oauth/bluesky/client-metadata.json"
    else
      "http://localhost?" <>
        URI.encode_query(%{"redirect_uri" => redirect_uri(), "scope" => @posting_scope}, :rfc3986)
    end
  end

  def redirect_uri do
    if confidential?() do
      Inkwell.Instance.frontend_url() <> "/auth/bluesky/callback"
    else
      # The localhost client only accepts loopback IPs as redirect hosts.
      port = URI.parse(Inkwell.Instance.frontend_url()).port || 3000
      "http://127.0.0.1:#{port}/auth/bluesky/callback"
    end
  end

  @doc "The client metadata document Bluesky fetches from our client_id URL."
  def client_metadata do
    base = Inkwell.Instance.frontend_url()

    %{
      "client_id" => client_id(),
      "client_name" => Inkwell.Instance.name(),
      "client_uri" => base,
      "logo_uri" => base <> "/icons/icon-192.png",
      "tos_uri" => base <> "/terms",
      "policy_uri" => base <> "/privacy",
      "redirect_uris" => [redirect_uri()],
      "grant_types" => ["authorization_code", "refresh_token"],
      "response_types" => ["code"],
      "scope" => @posting_scope,
      "application_type" => "web",
      "token_endpoint_auth_method" => "private_key_jwt",
      "token_endpoint_auth_signing_alg" => "ES256",
      "dpop_bound_access_tokens" => true,
      "jwks" => Keys.client_jwks()
    }
  end

  # ── Starting a sign-in ─────────────────────────────────────────────

  @doc """
  Start a sign-in. `input` is a handle, DID or "" (Bluesky's own picker).
  Options: `:purpose` ("sign_in" | "link" | "posting"), `:linking_user_id`,
  `:redirect_after`. Returns `{:ok, authorize_url}`.
  """
  def start(input, opts \\ []) do
    purpose = Keyword.get(opts, :purpose, "sign_in")
    scope = if purpose == "posting", do: @posting_scope, else: @sign_in_scope

    with {:ok, ident} <- Identity.resolve(input) do
      meta = ident.metadata
      {verifier, challenge} = Keys.pkce()
      dpop_key = Keys.new_dpop_key()
      state = Keys.random(32)

      params =
        %{
          "response_type" => "code",
          "code_challenge" => challenge,
          "code_challenge_method" => "S256",
          "state" => state,
          "redirect_uri" => redirect_uri(),
          "scope" => scope
        }
        |> maybe_put("login_hint", ident.handle || ident.did)
        |> Map.merge(client_auth(meta["issuer"]))

      case token_post(meta["pushed_authorization_request_endpoint"], params, dpop_key) do
        {:ok, %{"request_uri" => request_uri}} ->
          data = %{
            "verifier" => verifier,
            "dpop_key" => dpop_key,
            "issuer" => meta["issuer"],
            "did" => ident.did,
            "scope" => scope,
            "purpose" => purpose
          }

          %OAuthState{}
          |> OAuthState.changeset(%{
            state: state,
            domain: "bluesky",
            redirect_after: Keyword.get(opts, :redirect_after),
            linking_user_id: Keyword.get(opts, :linking_user_id),
            data: Keys.encrypt(data),
            expires_at: DateTime.add(DateTime.utc_now(), @state_ttl_seconds, :second)
          })
          |> Repo.insert!()

          query = URI.encode_query(%{"client_id" => client_id(), "request_uri" => request_uri})
          {:ok, meta["authorization_endpoint"] <> "?" <> query}

        {:ok, other} ->
          Logger.warning("Bluesky PAR refused: #{inspect(Map.take(other, ["error", "error_description"]))}")
          {:error, :authorization_refused}

        error ->
          error
      end
    end
  end

  # ── Finishing a sign-in ────────────────────────────────────────────

  @doc """
  Exchange the code and confirm who signed in. Returns `{:ok, session}`:
  `%{did, handle, pds_url, issuer, scope, access_token, refresh_token,
  expires_at, dpop_key, linking_user_id, redirect_after, purpose}`.
  """
  def finish(code, state_token, iss) do
    with {:ok, oauth_state} <- consume_state(state_token),
         {:ok, data} <- Keys.decrypt(oauth_state.data) |> ok_or(:invalid_state),
         true <- iss == data["issuer"] || {:error, :issuer_mismatch},
         {:ok, meta} <- Identity.server_metadata(data["issuer"]),
         params =
           %{
             "grant_type" => "authorization_code",
             "code" => code,
             "redirect_uri" => redirect_uri(),
             "code_verifier" => data["verifier"]
           }
           |> Map.merge(client_auth(meta["issuer"])),
         {:ok, tokens} <- token_post(meta["token_endpoint"], params, data["dpop_key"]),
         :ok <- check_tokens(tokens),
         true <- data["did"] == nil or tokens["sub"] == data["did"] || {:error, :account_mismatch},
         {:ok, who} <- Identity.verify_sub(tokens["sub"], meta["issuer"]) do
      {:ok,
       %{
         did: who.did,
         handle: who.handle,
         pds_url: who.pds_url,
         issuer: meta["issuer"],
         scope: tokens["scope"],
         access_token: tokens["access_token"],
         refresh_token: tokens["refresh_token"],
         expires_at: expires_at(tokens),
         dpop_key: data["dpop_key"],
         linking_user_id: oauth_state.linking_user_id,
         redirect_after: oauth_state.redirect_after,
         purpose: data["purpose"]
       }}
    end
  end

  defp check_tokens(%{"access_token" => a, "sub" => sub, "scope" => scope} = tokens)
       when is_binary(a) and is_binary(sub) and is_binary(scope) do
    cond do
      "atproto" not in String.split(scope) -> {:error, :missing_atproto_scope}
      String.downcase(tokens["token_type"] || "") != "dpop" -> {:error, :not_dpop}
      true -> :ok
    end
  end

  defp check_tokens(%{"error" => error}), do: {:error, {:oauth_error, error}}
  defp check_tokens(_), do: {:error, :invalid_token_response}

  @doc "Exchange a refresh token. Returns `{:ok, tokens}` with rotated refresh token."
  def refresh(%{"refresh_token" => refresh_token, "dpop_key" => dpop_key}, issuer) when is_binary(refresh_token) do
    with {:ok, meta} <- Identity.server_metadata(issuer),
         params =
           %{"grant_type" => "refresh_token", "refresh_token" => refresh_token}
           |> Map.merge(client_auth(meta["issuer"])),
         {:ok, tokens} <- token_post(meta["token_endpoint"], params, dpop_key) do
      case check_tokens(tokens) do
        :ok -> {:ok, Map.put(tokens, "expires_at", expires_at(tokens))}
        {:error, {:oauth_error, "invalid_grant"}} -> {:error, :session_ended}
        error -> error
      end
    end
  end

  def refresh(_, _), do: {:error, :session_ended}

  # ── Authorized requests to the member's PDS ────────────────────────

  @doc """
  An authorized XRPC request to the member's PDS with a DPoP-bound token.
  `session` holds `access_token` and `dpop_key`.
  """
  def pds_request(session, pds_url, method, nsid, opts \\ []) do
    url = String.trim_trailing(pds_url, "/") <> "/xrpc/" <> nsid
    do_pds_request(session, url, method, opts, true)
  end

  defp do_pds_request(session, url, method, opts, retry?) do
    origin = Identity.origin(url)
    proof = Keys.dpop_proof(session["dpop_key"], method, url, nonce(origin), session["access_token"])
    headers = [{"authorization", "DPoP " <> session["access_token"]}, {"dpop", proof}] ++ Keyword.get(opts, :headers, [])

    case Net.request(method, url, Keyword.put(opts, :headers, headers)) do
      {:ok, resp} ->
        remember_nonce(origin, resp)

        cond do
          retry? and resp.status == 401 and nonce_error?(resp) ->
            do_pds_request(session, url, method, opts, false)

          resp.status in 200..299 ->
            {:ok, Net.json_body(resp)}

          resp.status == 401 ->
            {:error, :unauthorized}

          true ->
            {:error, {:http_error, resp.status, Net.json_body(resp)["error"]}}
        end

      error ->
        error
    end
  end

  # ── Token endpoint (and PAR) with DPoP nonces ──────────────────────

  defp token_post(url, params, dpop_key, retry? \\ true) do
    origin = Identity.origin(url)
    proof = Keys.dpop_proof(dpop_key, :post, url, nonce(origin))

    case Net.request(:post, url, form: params, headers: [{"dpop", proof}, {"accept", "application/json"}]) do
      {:ok, resp} ->
        remember_nonce(origin, resp)
        body = Net.json_body(resp)

        cond do
          retry? and body["error"] == "use_dpop_nonce" -> token_post(url, params, dpop_key, false)
          resp.status in 200..299 -> {:ok, body}
          is_binary(body["error"]) -> {:ok, body}
          true -> {:error, {:http_error, resp.status}}
        end

      error ->
        error
    end
  end

  defp client_auth(issuer) do
    if confidential?() do
      %{
        "client_id" => client_id(),
        "client_assertion_type" => "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion" => Keys.client_assertion(client_id(), issuer)
      }
    else
      %{"client_id" => client_id()}
    end
  end

  defp nonce_error?(resp) do
    (Net.header(resp, "www-authenticate") || "") =~ "use_dpop_nonce" or
      Net.json_body(resp)["error"] == "use_dpop_nonce"
  end

  defp nonce(origin) do
    case :ets.lookup(@nonce_table, origin) do
      [{_, nonce}] -> nonce
      _ -> nil
    end
  end

  defp remember_nonce(origin, resp) do
    case Net.header(resp, "dpop-nonce") do
      nonce when is_binary(nonce) and nonce != "" ->
        :ets.insert(@nonce_table, {origin, nonce})

      _ ->
        :ok
    end
  end

  # ── State ──────────────────────────────────────────────────────────

  defp consume_state(token) when is_binary(token) do
    now = DateTime.utc_now()

    case Repo.one(from s in OAuthState, where: s.state == ^token and s.domain == "bluesky" and s.expires_at > ^now) do
      nil ->
        {:error, :invalid_state}

      state ->
        Repo.delete!(state)
        {:ok, state}
    end
  end

  defp consume_state(_), do: {:error, :invalid_state}

  defp expires_at(tokens) do
    seconds = if is_integer(tokens["expires_in"]), do: tokens["expires_in"], else: 300
    DateTime.add(DateTime.utc_now(), seconds, :second)
  end

  defp ok_or({:ok, v}, _), do: {:ok, v}
  defp ok_or(_, reason), do: {:error, reason}

  defp maybe_put(map, _k, nil), do: map
  defp maybe_put(map, k, v), do: Map.put(map, k, v)
end
