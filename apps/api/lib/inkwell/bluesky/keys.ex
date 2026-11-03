defmodule Inkwell.Bluesky.Keys do
  @moduledoc """
  The keys and signed tokens the AT Protocol sign-in needs:

    * Inkwell's own client key (ES256), from the `ATPROTO_CLIENT_KEY` secret,
      a private JWK with a `kid`. Its public half is published in the client
      metadata; Bluesky checks the "client assertion" we sign with it.
    * One DPoP key per member session, made at sign-in. Every request to
      Bluesky carries a fresh proof signed with it, so a stolen token is
      useless without the key.
    * Encryption for what we store (tokens, DPoP keys), with the app's
      secret_key_base.

  Generate a client key with `Inkwell.Bluesky.Keys.generate_client_key/0`.
  """

  @doc "The configured client key as a JOSE.JWK, or nil."
  def client_key do
    case Application.get_env(:inkwell, :atproto_client_key) do
      nil -> nil
      "" -> nil
      json when is_binary(json) -> json |> Jason.decode!() |> JOSE.JWK.from_map()
      %{} = map -> JOSE.JWK.from_map(map)
    end
  rescue
    _ -> nil
  end

  def client_kid do
    case Application.get_env(:inkwell, :atproto_client_key) do
      json when is_binary(json) and json != "" -> Jason.decode!(json)["kid"]
      %{} = map -> map["kid"]
      _ -> nil
    end
  rescue
    _ -> nil
  end

  @doc "Public JWK set for the client metadata."
  def client_jwks do
    case client_key() do
      nil ->
        %{"keys" => []}

      jwk ->
        {_, public} = jwk |> JOSE.JWK.to_public() |> JOSE.JWK.to_map()

        key =
          public
          |> Map.put("kid", client_kid())
          |> Map.put("alg", "ES256")
          |> Map.put("use", "sig")

        %{"keys" => [key]}
    end
  end

  @doc "A new private client key as JSON (for `fly secrets set ATPROTO_CLIENT_KEY=...`)."
  def generate_client_key do
    jwk = JOSE.JWK.generate_key({:ec, "P-256"})
    {_, map} = JOSE.JWK.to_map(jwk)
    kid = "inkwell-" <> String.slice(JOSE.JWK.thumbprint(jwk), 0, 12)
    map |> Map.put("kid", kid) |> Jason.encode!()
  end

  @doc "A new per-session DPoP key, as a private JWK map (stored encrypted)."
  def new_dpop_key do
    {_, map} = JOSE.JWK.generate_key({:ec, "P-256"}) |> JOSE.JWK.to_map()
    map
  end

  @doc """
  A DPoP proof for one request. `htu` is the URL without query or fragment.
  `access_token` adds the `ath` claim for requests to the PDS.
  """
  def dpop_proof(dpop_key_map, method, url, nonce, access_token \\ nil) do
    jwk = JOSE.JWK.from_map(dpop_key_map)
    {_, public} = jwk |> JOSE.JWK.to_public() |> JOSE.JWK.to_map()

    uri = URI.parse(url)
    htu = URI.to_string(%URI{uri | query: nil, fragment: nil})

    claims =
      %{
        "jti" => random(),
        "htm" => method |> to_string() |> String.upcase(),
        "htu" => htu,
        "iat" => System.system_time(:second)
      }
      |> maybe_put("nonce", nonce)
      |> maybe_put("ath", access_token && hash(access_token))

    sign(jwk, %{"alg" => "ES256", "typ" => "dpop+jwt", "jwk" => public}, claims)
  end

  @doc "Client assertion (RFC 7523) for the authorization server `issuer`."
  def client_assertion(client_id, issuer) do
    now = System.system_time(:second)

    claims = %{
      "iss" => client_id,
      "sub" => client_id,
      "aud" => issuer,
      "jti" => random(),
      "iat" => now,
      "exp" => now + 60
    }

    sign(client_key(), %{"alg" => "ES256", "kid" => client_kid()}, claims)
  end

  @doc "PKCE verifier and its S256 challenge."
  def pkce do
    verifier = random(48)
    {verifier, :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)}
  end

  def random(bytes \\ 24), do: :crypto.strong_rand_bytes(bytes) |> Base.url_encode64(padding: false)

  # ── Encryption at rest ─────────────────────────────────────────────

  @salt "bluesky session v1"

  def encrypt(term), do: Plug.Crypto.encrypt(secret(), @salt, term)

  def decrypt(nil), do: :error

  def decrypt(token) when is_binary(token) do
    case Plug.Crypto.decrypt(secret(), @salt, token, max_age: :infinity) do
      {:ok, term} -> {:ok, term}
      _ -> :error
    end
  end

  defp secret, do: InkwellWeb.Endpoint.config(:secret_key_base)

  # ── Helpers ────────────────────────────────────────────────────────

  defp sign(jwk, header, claims) do
    {_, token} = JOSE.JWT.sign(jwk, JOSE.JWS.from_map(header), JOSE.JWT.from_map(claims)) |> JOSE.JWS.compact()
    token
  end

  defp hash(value), do: :crypto.hash(:sha256, value) |> Base.url_encode64(padding: false)

  defp maybe_put(map, _k, nil), do: map
  defp maybe_put(map, k, v), do: Map.put(map, k, v)
end
