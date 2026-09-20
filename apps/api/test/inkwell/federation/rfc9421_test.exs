defmodule Inkwell.Federation.Rfc9421Test do
  @moduledoc """
  RFC 9421 HTTP Message Signatures, the scheme Mastodon 4.7 sends.

  The signature base is asserted against a literally written expected string
  rather than against whatever the implementation happens to produce, because a
  base that is self-consistent but does not match the RFC verifies nothing that
  a real sender signed.
  """
  use ExUnit.Case, async: true

  alias Inkwell.Federation.{HttpSignature, Rfc9421}

  setup_all do
    private_key = :public_key.generate_key({:rsa, 2048, 65_537})
    public_key = {:RSAPublicKey, elem(private_key, 2), elem(private_key, 3)}

    public_pem =
      :public_key.pem_encode([:public_key.pem_entry_encode(:SubjectPublicKeyInfo, public_key)])

    %{private_key: private_key, public_pem: public_pem}
  end

  defp build_conn(body, headers) do
    :post
    |> Plug.Test.conn("/inbox", body)
    |> Map.put(:host, "api.inkwell.social")
    |> then(fn conn ->
      Enum.reduce(headers, conn, fn {k, v}, acc -> Plug.Conn.put_req_header(acc, k, v) end)
    end)
    |> Plug.Conn.put_private(:raw_body, body)
  end

  defp content_digest(body), do: "sha-256=:" <> Base.encode64(:crypto.hash(:sha256, body)) <> ":"

  defp sign(base, private_key), do: base |> then(&:public_key.sign(&1, :sha256, private_key)) |> Base.encode64()

  # A request shaped like the ones Mastodon actually delivers: signed over the
  # method, the target URI and the body digest, addressed to inkwell.social but
  # arriving at the API with the original host in `x-original-host`.
  defp signed_request(body, private_key, opts \\ []) do
    created = Keyword.get(opts, :created, System.system_time(:second))
    key_id = Keyword.get(opts, :key_id, "https://mastodon.social/users/alice#main-key")
    digest = Keyword.get(opts, :digest, content_digest(body))

    params =
      ~s[("@method" "@target-uri" "content-digest");created=#{created};keyid="#{key_id}";alg="rsa-v1_5-sha256"]

    base =
      """
      "@method": POST
      "@target-uri": https://inkwell.social/inbox
      "content-digest": #{digest}
      "@signature-params": #{params}\
      """

    conn =
      build_conn(body, [
        {"x-original-host", "inkwell.social"},
        {"content-digest", digest},
        {"signature-input", "sig1=#{params}"},
        {"signature", "sig1=:#{sign(base, private_key)}:"}
      ])

    {conn, base}
  end

  describe "scheme detection" do
    test "recognises an RFC 9421 Signature header" do
      assert Rfc9421.signature_header?("sig1=:aGVsbG8=:")
      assert Rfc9421.signature_header?("  sig-b26=:aGVsbG8=:")
    end

    test "does not claim a draft-cavage header" do
      cavage =
        ~s[keyId="https://example.com/users/a#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="abc=="]

      refute Rfc9421.signature_header?(cavage)
    end
  end

  describe "signature base" do
    test "matches the serialisation RFC 9421 specifies", %{private_key: key} do
      {conn, expected_base} = signed_request(~s({"type":"Create"}), key)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert Rfc9421.signature_base(conn, parts) == expected_base
    end

    test "rebuilds @target-uri from the host the sender addressed, not the proxy's",
         %{private_key: key} do
      {conn, _} = signed_request(~s({"type":"Create"}), key)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      base = Rfc9421.signature_base(conn, parts)

      assert base =~ ~s("@target-uri": https://inkwell.social/inbox)
      refute base =~ "api.inkwell.social"
    end
  end

  describe "parsing" do
    test "exposes keyId under the same key as the Cavage parser", %{private_key: key} do
      {conn, _} = signed_request("{}", key, key_id: "https://example.social/users/bob#main-key")

      assert {:ok, parts} = HttpSignature.parse_signature(conn)
      assert parts["keyId"] == "https://example.social/users/bob#main-key"
      assert parts["__scheme"] == "rfc9421"
    end

    test "rejects a Signature-Input without a keyid", %{private_key: key} do
      body = "{}"
      params = ~s[("@method");created=#{System.system_time(:second)}]

      conn =
        build_conn(body, [
          {"signature-input", "sig1=#{params}"},
          {"signature", "sig1=:#{sign("x", key)}:"}
        ])

      assert {:error, :missing_keyid} = HttpSignature.parse_signature(conn)
    end

    test "reports a missing Signature-Input rather than treating it as Cavage" do
      conn = build_conn("{}", [{"signature", "sig1=:aGVsbG8=:"}])

      assert {:error, :no_signature} = HttpSignature.parse_signature(conn)
    end
  end

  describe "verification" do
    test "accepts a correctly signed request", %{private_key: key, public_pem: pem} do
      {conn, _} = signed_request(~s({"type":"Create","actor":"https://x/y"}), key)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert :ok = HttpSignature.verify_signature(conn, parts, pem)
    end

    test "rejects a signature made by a different key", %{private_key: key, public_pem: _pem} do
      other = :public_key.generate_key({:rsa, 2048, 65_537})

      other_pem =
        :public_key.pem_encode([
          :public_key.pem_entry_encode(
            :SubjectPublicKeyInfo,
            {:RSAPublicKey, elem(other, 2), elem(other, 3)}
          )
        ])

      {conn, _} = signed_request("{}", key)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert {:error, :invalid_signature} = HttpSignature.verify_signature(conn, parts, other_pem)
    end

    test "rejects a body swapped after signing", %{private_key: key, public_pem: pem} do
      original = ~s({"type":"Create"})
      {conn, _} = signed_request(original, key)

      # Same headers, different body: the Content-Digest no longer describes it.
      tampered = Plug.Conn.put_private(conn, :raw_body, ~s({"type":"Delete"}))
      {:ok, parts} = HttpSignature.parse_signature(tampered)

      assert {:error, :digest_mismatch} = HttpSignature.verify_signature(tampered, parts, pem)
    end

    test "rejects a Content-Digest header rewritten to match a swapped body",
         %{private_key: key, public_pem: pem} do
      tampered_body = ~s({"type":"Delete"})
      {conn, _} = signed_request(~s({"type":"Create"}), key)

      conn =
        conn
        |> Plug.Conn.put_private(:raw_body, tampered_body)
        |> Plug.Conn.delete_req_header("content-digest")
        |> Plug.Conn.put_req_header("content-digest", content_digest(tampered_body))

      {:ok, parts} = HttpSignature.parse_signature(conn)

      # The digest now matches the body, but it is one of the signed components,
      # so the signature base no longer reproduces what was signed.
      assert {:error, :invalid_signature} = HttpSignature.verify_signature(conn, parts, pem)
    end

    test "rejects a stale created timestamp", %{private_key: key, public_pem: pem} do
      {conn, _} = signed_request("{}", key, created: System.system_time(:second) - 90_000)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert {:error, :date_skew_too_large} = HttpSignature.verify_signature(conn, parts, pem)
    end

    test "rejects an algorithm we cannot verify", %{private_key: key, public_pem: pem} do
      body = "{}"
      created = System.system_time(:second)
      digest = content_digest(body)

      params =
        ~s[("@method" "@target-uri" "content-digest");created=#{created};keyid="https://h/u#k";alg="ed25519"]

      base =
        ~s("@method": POST\n) <>
          ~s("@target-uri": https://inkwell.social/inbox\n) <>
          ~s("content-digest": #{digest}\n) <>
          ~s("@signature-params": #{params})

      conn =
        build_conn(body, [
          {"x-original-host", "inkwell.social"},
          {"content-digest", digest},
          {"signature-input", "sig1=#{params}"},
          {"signature", "sig1=:#{sign(base, key)}:"}
        ])

      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert {:error, {:unsupported_algorithm, "ed25519"}} =
               HttpSignature.verify_signature(conn, parts, pem)
    end

    test "rejects a digest algorithm it cannot check", %{private_key: key, public_pem: pem} do
      body = "{}"
      sha512 = "sha-512=:" <> Base.encode64(:crypto.hash(:sha512, body)) <> ":"
      {conn, _} = signed_request(body, key, digest: sha512)
      {:ok, parts} = HttpSignature.parse_signature(conn)

      assert {:error, :unsupported_digest} = HttpSignature.verify_signature(conn, parts, pem)
    end
  end

  describe "draft-cavage still works" do
    test "a Cavage-signed request verifies unchanged", %{private_key: key, public_pem: pem} do
      body = ~s({"type":"Create"})
      date = Calendar.strftime(DateTime.utc_now(), "%a, %d %b %Y %H:%M:%S GMT")
      digest = "SHA-256=" <> Base.encode64(:crypto.hash(:sha256, body))

      signing_string =
        "(request-target): post /inbox\nhost: inkwell.social\ndate: #{date}\ndigest: #{digest}"

      header =
        ~s[keyId="https://h/users/a#main-key",algorithm="rsa-sha256",] <>
          ~s[headers="(request-target) host date digest",signature="#{sign(signing_string, key)}"]

      conn =
        build_conn(body, [
          {"x-original-host", "inkwell.social"},
          {"date", date},
          {"digest", digest},
          {"signature", header}
        ])

      assert {:ok, parts} = HttpSignature.parse_signature(conn)
      assert parts["keyId"] == "https://h/users/a#main-key"
      assert :ok = HttpSignature.verify_signature(conn, parts, pem)
    end
  end
end
