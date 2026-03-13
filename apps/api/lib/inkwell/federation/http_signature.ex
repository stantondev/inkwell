defmodule Inkwell.Federation.HttpSignature do
  @moduledoc """
  HTTP Signature signing and verification for ActivityPub.

  Implements the Cavage HTTP Signatures draft (used by Mastodon, Pleroma, etc.):
  - Signing outbound requests with RSA-SHA256
  - Verifying inbound request signatures
  - Digest validation (prevents body tampering — CVE-2023-49079)
  - Date skew validation (prevents replay attacks)

  Uses Erlang's :public_key and :crypto — no external deps.
  """

  require Logger

  # Maximum allowed clock skew for Date header (matches Mastodon's 12-hour window)
  @max_clock_skew_seconds 43_200

  # ── Signing (outbound POST) ───────────────────────────────────────────

  @doc """
  Signs an outbound HTTP POST request. Returns headers to include.

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

    # Build the signing string — includes content-type for completeness
    headers_to_sign = "(request-target) host date digest content-type"
    request_target = "#{String.downcase(method)} #{uri.path}"

    signing_string =
      "(request-target): #{request_target}\n" <>
      "host: #{uri.host}\n" <>
      "date: #{date}\n" <>
      "digest: #{digest}\n" <>
      "content-type: application/activity+json"

    # Sign with RSA-SHA256
    private_key = decode_private_key(private_key_pem)
    signature = :public_key.sign(signing_string, :sha256, private_key)
    signature_b64 = Base.encode64(signature)

    # Build Signature header (hs2019 = determine algorithm from key metadata)
    sig_header =
      ~s(keyId="#{key_id}",algorithm="hs2019",headers="#{headers_to_sign}",signature="#{signature_b64}")

    [
      {"date", date},
      {"digest", digest},
      {"signature", sig_header},
      {"content-type", "application/activity+json"},
      {"accept", "application/activity+json"}
    ]
  end

  # ── Signing (outbound GET for authorized fetch) ───────────────────────

  @doc """
  Signs an outbound HTTP GET request. Returns headers to include.

  Used for fetching remote actors/objects from servers that require
  authorized fetch (secure mode) — e.g., GoToSocial always, Mastodon
  when enabled.

  ## Parameters
    - url: Full URL string
    - private_key_pem: PEM-encoded RSA private key
    - key_id: The signing key's AP ID (e.g., "https://host/users/name#main-key")
  """
  def sign_get(url, private_key_pem, key_id) do
    uri = URI.parse(url)
    date = format_http_date()

    headers_to_sign = "(request-target) host date accept"
    request_target = "get #{uri.path}"

    signing_string =
      "(request-target): #{request_target}\n" <>
      "host: #{uri.host}\n" <>
      "date: #{date}\n" <>
      "accept: application/activity+json"

    private_key = decode_private_key(private_key_pem)
    signature = :public_key.sign(signing_string, :sha256, private_key)
    signature_b64 = Base.encode64(signature)

    sig_header =
      ~s(keyId="#{key_id}",algorithm="hs2019",headers="#{headers_to_sign}",signature="#{signature_b64}")

    [
      {"date", date},
      {"signature", sig_header},
      {"accept", "application/activity+json"}
    ]
  end

  # ── Verification (inbound) ─────────────────────────────────────────────

  @doc """
  Parses the HTTP Signature header on an inbound request.
  Returns `{:ok, parts}` or `{:error, reason}`.
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

  Performs three checks:
  1. Date header within ±12 hours (replay prevention)
  2. Digest header matches actual body (body tampering prevention)
  3. Cryptographic signature is valid (authenticity)
  """
  def verify_signature(conn, sig_parts, public_key_pem) do
    with :ok <- verify_date(conn),
         :ok <- verify_digest(conn, sig_parts),
         :ok <- verify_crypto(conn, sig_parts, public_key_pem) do
      :ok
    end
  rescue
    e ->
      Logger.warning("Signature verification error: #{inspect(e)}")
      {:error, :verification_failed}
  end

  # ── Date skew validation ──────────────────────────────────────────────

  defp verify_date(conn) do
    case get_header(conn, "date") do
      "" ->
        # No Date header — some implementations use (created) instead.
        # Allow it through; the signature itself is still verified.
        :ok

      date_str ->
        case parse_http_date(date_str) do
          {:ok, date_time} ->
            skew = abs(DateTime.diff(DateTime.utc_now(), date_time, :second))

            if skew <= @max_clock_skew_seconds do
              :ok
            else
              Logger.warning("Date skew too large: #{skew}s (max #{@max_clock_skew_seconds}s)")
              {:error, :date_skew_too_large}
            end

          :error ->
            # Unparseable date — reject rather than accept blindly
            Logger.warning("Unparseable Date header: #{date_str}")
            {:error, :invalid_date}
        end
    end
  end

  defp parse_http_date(date_str) do
    # HTTP dates are RFC 2616 format: "Sun, 06 Nov 1994 08:49:37 GMT"
    # Erlang's :httpd_util.convert_request_date handles all three HTTP date formats
    case :httpd_util.convert_request_date(String.to_charlist(date_str)) do
      :bad_date ->
        :error

      erl_datetime ->
        case NaiveDateTime.from_erl(erl_datetime) do
          {:ok, naive} -> {:ok, DateTime.from_naive!(naive, "Etc/UTC")}
          _ -> :error
        end
    end
  end

  # ── Digest validation (CVE-2023-49079 prevention) ─────────────────────

  defp verify_digest(conn, sig_parts) do
    signed_headers = Map.get(sig_parts, "headers", "date") |> String.split(" ")

    if "digest" in signed_headers do
      # Digest was signed — we MUST validate the body matches
      case get_header(conn, "digest") do
        "" ->
          Logger.warning("Digest header signed but not present in request")
          {:error, :missing_digest}

        digest_header ->
          {:ok, body, _conn} = Plug.Conn.read_body(conn)
          expected = "SHA-256=" <> (:crypto.hash(:sha256, body) |> Base.encode64())

          if Plug.Crypto.secure_compare(digest_header, expected) do
            :ok
          else
            Logger.warning("Digest mismatch: header=#{digest_header} computed=#{expected}")
            {:error, :digest_mismatch}
          end
      end
    else
      # Digest wasn't in the signed headers — nothing to validate
      :ok
    end
  end

  # ── Cryptographic signature verification ──────────────────────────────

  defp verify_crypto(conn, sig_parts, public_key_pem) do
    signing_string = reconstruct_signing_string(conn, sig_parts)

    case Base.decode64(sig_parts["signature"]) do
      {:ok, signature_bytes} ->
        public_key = decode_public_key(public_key_pem)

        if :public_key.verify(signing_string, :sha256, signature_bytes, public_key) do
          :ok
        else
          {:error, :invalid_signature}
        end

      :error ->
        Logger.warning("Invalid Base64 in signature value")
        {:error, :invalid_signature_encoding}
    end
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
    build_signing_string_from_list(conn, signed_headers)
  end

  defp build_signing_string_from_list(conn, headers_list) do
    headers_list
    |> Enum.map(fn
      "(request-target)" ->
        method = conn.method |> String.downcase()
        path = conn.request_path
        query = if conn.query_string != "", do: "?#{conn.query_string}", else: ""
        "(request-target): #{method} #{path}#{query}"

      "host" ->
        # Use X-Original-Host when present — the Next.js federation proxy
        # forwards the original Host header here because Node.js fetch()
        # overrides Host with the internal API hostname.
        host =
          case get_header(conn, "x-original-host") do
            "" -> get_header(conn, "host")
            original -> original
          end

        "host: #{host}"

      "date" ->
        "date: #{get_header(conn, "date")}"

      "digest" ->
        "digest: #{get_header(conn, "digest")}"

      "content-type" ->
        "content-type: #{get_header(conn, "content-type")}"

      "(created)" ->
        "(created): #{get_header(conn, "(created)")}"

      "(expires)" ->
        "(expires): #{get_header(conn, "(expires)")}"

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
