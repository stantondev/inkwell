defmodule Inkwell.Federation.HttpSignature do
  @moduledoc """
  HTTP Signature signing and verification for ActivityPub.

  Implements the Cavage HTTP Signatures draft (used by Mastodon, Pleroma, etc.):
  - Signing outbound requests with RSA-SHA256
  - Verifying inbound request signatures

  Uses Erlang's :public_key and :crypto — no external deps.
  """

  require Logger

  # ── Signing (outbound) ──────────────────────────────────────────────────

  @doc """
  Signs an outbound HTTP request. Returns headers to include.

  ## Parameters
    - method: HTTP method string (e.g., "post")
    - url: Full URL string
    - body: Request body string (JSON)
    - private_key_pem: PEM-encoded RSA private key
    - key_id: The signing key's AP ID (e.g., "https://host/users/name#main-key")
  """
  def sign(method, url, body, private_key_pem, key_id) do
    uri = URI.parse(url)
    date = format_http_date()
    digest = "SHA-256=" <> (:crypto.hash(:sha256, body) |> Base.encode64())

    # Build the signing string
    headers_to_sign = "(request-target) host date digest"
    request_target = "#{String.downcase(method)} #{uri.path}"

    signing_string =
      "(request-target): #{request_target}\n" <>
      "host: #{uri.host}\n" <>
      "date: #{date}\n" <>
      "digest: #{digest}"

    # Sign with RSA-SHA256
    private_key = decode_private_key(private_key_pem)
    signature = :public_key.sign(signing_string, :sha256, private_key)
    signature_b64 = Base.encode64(signature)

    # Build Signature header
    sig_header =
      ~s(keyId="#{key_id}",algorithm="rsa-sha256",headers="#{headers_to_sign}",signature="#{signature_b64}")

    [
      {"date", date},
      {"digest", digest},
      {"signature", sig_header},
      {"content-type", "application/activity+json"},
      {"accept", "application/activity+json"}
    ]
  end

  # ── Verification (inbound) ─────────────────────────────────────────────

  @doc """
  Verifies the HTTP signature on an inbound request.
  Returns `{:ok, key_id}` or `{:error, reason}`.

  The caller is responsible for fetching the actor's public key
  using the key_id from the signature.
  """
  def parse_signature(conn) do
    with sig_header when is_binary(sig_header) <- get_signature_header(conn),
         {:ok, parts} <- parse_signature_header(sig_header) do
      {:ok, parts}
    else
      nil -> {:error, :no_signature}
      error -> error
    end
  end

  @doc """
  Verifies a parsed signature against the request using the given public key PEM.
  """
  def verify_signature(conn, sig_parts, public_key_pem) do
    signing_string = reconstruct_signing_string(conn, sig_parts)
    signature_bytes = Base.decode64!(sig_parts["signature"])
    public_key = decode_public_key(public_key_pem)

    if :public_key.verify(signing_string, :sha256, signature_bytes, public_key) do
      :ok
    else
      {:error, :invalid_signature}
    end
  rescue
    e ->
      Logger.warning("Signature verification failed: #{inspect(e)}")
      {:error, :verification_failed}
  end

  # ── Private helpers ────────────────────────────────────────────────────

  defp get_signature_header(conn) do
    case Plug.Conn.get_req_header(conn, "signature") do
      [sig | _] -> sig
      [] -> nil
    end
  end

  defp parse_signature_header(header) do
    parts =
      Regex.scan(~r/(\w+)="([^"]*)"/, header)
      |> Enum.reduce(%{}, fn [_, key, val], acc -> Map.put(acc, key, val) end)

    if Map.has_key?(parts, "keyId") && Map.has_key?(parts, "signature") do
      {:ok, parts}
    else
      {:error, :malformed_signature}
    end
  end

  defp reconstruct_signing_string(conn, sig_parts) do
    signed_headers = Map.get(sig_parts, "headers", "date") |> String.split(" ")

    signed_headers
    |> Enum.map(fn
      "(request-target)" ->
        method = conn.method |> String.downcase()
        path = conn.request_path
        query = if conn.query_string != "", do: "?#{conn.query_string}", else: ""
        "(request-target): #{method} #{path}#{query}"

      "host" ->
        "host: #{get_header(conn, "host")}"

      "date" ->
        "date: #{get_header(conn, "date")}"

      "digest" ->
        "digest: #{get_header(conn, "digest")}"

      "content-type" ->
        "content-type: #{get_header(conn, "content-type")}"

      header ->
        "#{header}: #{get_header(conn, header)}"
    end)
    |> Enum.join("\n")
  end

  defp get_header(conn, name) do
    case Plug.Conn.get_req_header(conn, name) do
      [val | _] -> val
      [] -> ""
    end
  end

  defp decode_private_key(pem) do
    [entry | _] = :public_key.pem_decode(pem)
    :public_key.pem_entry_decode(entry)
  end

  defp decode_public_key(pem) do
    [entry | _] = :public_key.pem_decode(pem)
    :public_key.pem_entry_decode(entry)
  end

  defp format_http_date do
    Calendar.strftime(DateTime.utc_now(), "%a, %d %b %Y %H:%M:%S GMT")
  end
end
