defmodule Inkwell.Federation.Rfc9421 do
  @moduledoc """
  Verification of RFC 9421 HTTP Message Signatures on inbound ActivityPub requests.

  This is the IETF standard that supersedes the `draft-cavage-http-signatures`
  scheme the Fediverse started on. Mastodon 4.7 sends it, falling back to Cavage
  only when a server rejects it, so a server that cannot read it pays a failed
  delivery for every activity. `Inkwell.Federation.HttpSignature` still handles
  Cavage; this module handles the newer form, and the two are told apart by the
  shape of the `Signature` header.

  Cavage put everything in one header:

      Signature: keyId="https://host/users/a#main-key",headers="(request-target) host date digest",signature="<base64>"

  RFC 9421 splits it in two, and the signature is a Structured Fields byte
  sequence rather than a quoted string:

      Signature-Input: sig1=("@method" "@target-uri" "content-digest");created=1758412800;keyid="https://host/users/a#main-key";alg="rsa-v1_5-sha256"
      Signature: sig1=:<base64>:

  Body integrity moves from `Digest: SHA-256=<base64>` to RFC 9530
  `Content-Digest: sha-256=:<base64>:`.

  Only `rsa-v1_5-sha256` is verifiable here — it is what Mastodon signs with,
  and it is the same primitive as Cavage's `rsa-sha256`, so it reuses the RSA
  public key already cached on the remote actor. Ed25519 signatures need a key
  we do not store (FEP-521a `assertionMethod`) and are reported as unsupported
  rather than silently accepted.
  """

  require Logger

  # Matches Cavage's window in `HttpSignature`, and Mastodon's own tolerance.
  @max_clock_skew_seconds 43_200

  @doc """
  True when a `Signature` header value is RFC 9421 rather than Cavage.

  RFC 9421 is a Structured Fields dictionary of byte sequences, so a member's
  value opens with a colon (`sig1=:...:`). Cavage's value is a comma-separated
  list of `key="value"` pairs and never has a bare colon in that position.
  """
  def signature_header?(value) when is_binary(value) do
    Regex.match?(~r/^\s*[A-Za-z0-9_.\-*]+\s*=\s*:/, value)
  end

  def signature_header?(_), do: false

  @doc """
  Parses the `Signature` and `Signature-Input` headers.

  Returns `{:ok, parts}`, where `parts` carries the `keyId` under the same key
  the Cavage parser uses so callers resolving an actor from a signature do not
  have to care which scheme was used.
  """
  def parse(conn) do
    with {:ok, sig_header} <- header(conn, "signature"),
         {:ok, input_header} <- header(conn, "signature-input"),
         {:ok, label, components, signature_params} <- parse_signature_input(input_header),
         {:ok, signature} <- extract_signature(sig_header, label),
         {:ok, key_id} <- require_param(signature_params, "keyid") do
      {:ok,
       %{
         "keyId" => key_id,
         "signature" => signature,
         "__scheme" => "rfc9421",
         "__label" => label,
         "__components" => components,
         "__signature_params" => signature_params
       }}
    end
  end

  @doc """
  Verifies a parsed RFC 9421 signature against the request.

  Three checks, mirroring the Cavage path: the `created` timestamp is within the
  clock-skew window, `Content-Digest` matches the body we actually received, and
  the signature verifies over the reconstructed signature base.
  """
  def verify(conn, parts, public_key_pem) do
    with :ok <- verify_created(parts),
         :ok <- verify_expires(parts),
         :ok <- verify_algorithm(parts),
         :ok <- verify_content_digest(conn, parts),
         :ok <- verify_crypto(conn, parts, public_key_pem) do
      :ok
    end
  rescue
    e ->
      Logger.warning("RFC 9421 verification error: #{inspect(e)}")
      {:error, :verification_failed}
  end

  # ── Signature-Input parsing ────────────────────────────────────────────
  #
  # `sig1=("@method" "@target-uri" "content-digest");created=1758412800;keyid="..."`
  #
  # The parenthesised inner list names what was signed, in order. Everything from
  # the `(` onwards is also the value of the trailing `@signature-params` line in
  # the signature base, and it is echoed back byte for byte rather than
  # re-serialised — a re-serialisation that differs anywhere, even in spacing,
  # produces a base that cannot verify.

  defp parse_signature_input(header) do
    case first_member(header) do
      {:ok, label, serialization} ->
        with {:ok, inner, params_text} <- split_inner_list(serialization) do
          {:ok, label, parse_components(inner),
           %{
             raw: serialization,
             params: parse_params(params_text)
           }}
        end

      :error ->
        {:error, :malformed_signature_input}
    end
  end

  # Takes the first dictionary member. A request carrying several signatures is
  # vanishingly rare in the Fediverse, and one verified signature is enough.
  defp first_member(header) do
    member = header |> split_top_level_commas() |> List.first()

    case member && String.split(member, "=", parts: 2) do
      [label, serialization] ->
        label = String.trim(label)
        serialization = String.trim(serialization)

        if label != "" and String.starts_with?(serialization, "(") do
          {:ok, label, serialization}
        else
          :error
        end

      _ ->
        :error
    end
  end

  # Commas inside quoted strings or inside the inner list do not separate members.
  defp split_top_level_commas(text) do
    {parts, current, _, _} =
      text
      |> String.graphemes()
      |> Enum.reduce({[], "", false, 0}, fn
        "\"", {parts, current, in_quotes, depth} ->
          {parts, current <> "\"", not in_quotes, depth}

        "(", {parts, current, false, depth} ->
          {parts, current <> "(", false, depth + 1}

        ")", {parts, current, false, depth} ->
          {parts, current <> ")", false, max(depth - 1, 0)}

        ",", {parts, current, false, 0} ->
          {parts ++ [current], "", false, 0}

        char, {parts, current, in_quotes, depth} ->
          {parts, current <> char, in_quotes, depth}
      end)

    (parts ++ [current])
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  # Splits `("a" "b");created=1;keyid="x"` into the text inside the parentheses
  # and the parameter text that follows them.
  defp split_inner_list("(" <> rest) do
    case close_paren_index(rest) do
      nil -> {:error, :malformed_signature_input}
      idx -> {:ok, String.slice(rest, 0, idx), String.slice(rest, (idx + 1)..-1//1) || ""}
    end
  end

  defp split_inner_list(_), do: {:error, :malformed_signature_input}

  defp close_paren_index(text) do
    text
    |> String.graphemes()
    |> Enum.reduce_while({0, false}, fn
      "\"", {idx, in_quotes} -> {:cont, {idx + 1, not in_quotes}}
      ")", {idx, false} -> {:halt, idx}
      _, {idx, in_quotes} -> {:cont, {idx + 1, in_quotes}}
    end)
    |> case do
      {_, _} -> nil
      idx -> idx
    end
  end

  # Each component is a quoted name, optionally followed by its own parameters
  # (`"content-digest";sf`). The raw identifier text is kept because the
  # signature base line must reproduce it exactly.
  defp parse_components(inner) do
    ~r/"([^"]*)"((?:;[^;\s)]+)*)/
    |> Regex.scan(inner)
    |> Enum.map(fn
      [_, name, params] -> %{name: String.downcase(name), raw: ~s("#{name}") <> params}
      [_, name] -> %{name: String.downcase(name), raw: ~s("#{name}")}
    end)
  end

  defp parse_params(text) do
    ~r/;\s*([A-Za-z0-9_.\-*]+)\s*=\s*(?:"([^"]*)"|([^;,\s]+))/
    |> Regex.scan(text)
    |> Enum.reduce(%{}, fn
      [_, key, quoted], acc when quoted != "" -> Map.put(acc, String.downcase(key), quoted)
      [_, key, _, bare], acc -> Map.put(acc, String.downcase(key), bare)
      [_, key, quoted], acc -> Map.put(acc, String.downcase(key), quoted)
    end)
  end

  defp require_param(%{params: params}, name) do
    case Map.get(params, name) do
      value when is_binary(value) and value != "" -> {:ok, value}
      _ -> {:error, :missing_keyid}
    end
  end

  # ── Signature header ───────────────────────────────────────────────────

  # `sig1=:<base64>:` — pull out the member matching the Signature-Input label.
  defp extract_signature(header, label) do
    pattern = ~r/(?:^|,)\s*#{Regex.escape(label)}\s*=\s*:([A-Za-z0-9+\/=]*):/

    case Regex.run(pattern, header) do
      [_, base64] -> {:ok, base64}
      _ -> {:error, :malformed_signature}
    end
  end

  # ── Checks ─────────────────────────────────────────────────────────────

  defp verify_created(%{"__signature_params" => %{params: params}}) do
    case Map.get(params, "created") do
      nil ->
        :ok

      created ->
        case Integer.parse(created) do
          {unix, _} ->
            skew = abs(System.system_time(:second) - unix)

            if skew <= @max_clock_skew_seconds do
              :ok
            else
              Logger.warning("RFC 9421 created skew too large: #{skew}s")
              {:error, :date_skew_too_large}
            end

          :error ->
            {:error, :invalid_date}
        end
    end
  end

  defp verify_expires(%{"__signature_params" => %{params: params}}) do
    case Map.get(params, "expires") do
      nil ->
        :ok

      expires ->
        case Integer.parse(expires) do
          {unix, _} ->
            # Allow the same slack as `created`, so a sender whose clock runs
            # behind ours does not have every signature read as already expired.
            if System.system_time(:second) - unix <= @max_clock_skew_seconds do
              :ok
            else
              {:error, :signature_expired}
            end

          :error ->
            {:error, :invalid_date}
        end
    end
  end

  defp verify_algorithm(%{"__signature_params" => %{params: params}}) do
    case Map.get(params, "alg") do
      nil -> :ok
      "rsa-v1_5-sha256" -> :ok
      other -> {:error, {:unsupported_algorithm, other}}
    end
  end

  # RFC 9530: `Content-Digest: sha-256=:<base64>:`. Listing it among the signed
  # components only proves the header was not altered, so the body still has to
  # be hashed and compared — the same reason the Cavage path checks `Digest`.
  defp verify_content_digest(conn, %{"__components" => components}) do
    if Enum.any?(components, &(&1.name == "content-digest")) do
      case get_header(conn, "content-digest") do
        "" ->
          {:error, :missing_digest}

        header ->
          case conn.private[:raw_body] do
            raw when is_binary(raw) -> compare_content_digest(header, raw)
            _ -> {:error, :digest_body_not_cached}
          end
      end
    else
      :ok
    end
  end

  defp compare_content_digest(header, raw) do
    case Regex.run(~r/sha-256\s*=\s*:([A-Za-z0-9+\/=]*):/i, header) do
      [_, base64] ->
        expected = :crypto.hash(:sha256, raw) |> Base.encode64()

        if Plug.Crypto.secure_compare(base64, expected) do
          :ok
        else
          Logger.warning("RFC 9421 Content-Digest mismatch")
          {:error, :digest_mismatch}
        end

      _ ->
        # Only SHA-256 is implemented; a digest we cannot check is not a digest
        # we can accept, since the body would then be unverified.
        Logger.warning("RFC 9421 Content-Digest not SHA-256: #{String.slice(header, 0, 80)}")
        {:error, :unsupported_digest}
    end
  end

  defp verify_crypto(conn, parts, public_key_pem) do
    base = signature_base(conn, parts)

    case Base.decode64(parts["signature"]) do
      {:ok, signature_bytes} ->
        public_key = decode_public_key(public_key_pem)

        if :public_key.verify(base, :sha256, signature_bytes, public_key) do
          :ok
        else
          {:error, :invalid_signature}
        end

      :error ->
        {:error, :invalid_signature_encoding}
    end
  end

  # ── Signature base ─────────────────────────────────────────────────────

  @doc false
  def signature_base(conn, %{"__components" => components, "__signature_params" => %{raw: raw}}) do
    lines =
      Enum.map(components, fn component ->
        "#{component.raw}: #{component_value(conn, component.name)}"
      end)

    Enum.join(lines ++ [~s("@signature-params": ) <> raw], "\n")
  end

  # Derived components are computed from the request line; everything else is an
  # HTTP field, whose value is its field values with surrounding whitespace
  # stripped, joined with ", " when the header repeats.
  defp component_value(conn, "@method"), do: String.upcase(conn.method)
  defp component_value(conn, "@target-uri"), do: target_uri(conn)
  defp component_value(conn, "@authority"), do: authority(conn)
  defp component_value(conn, "@scheme"), do: scheme(conn)
  defp component_value(conn, "@request-target"), do: conn.request_path <> query_suffix(conn)
  defp component_value(conn, "@path"), do: conn.request_path

  defp component_value(conn, "@query"),
    do: if(conn.query_string == "", do: "?", else: "?" <> conn.query_string)

  defp component_value(conn, field) do
    conn
    |> Plug.Conn.get_req_header(field)
    |> Enum.map(&String.trim/1)
    |> Enum.join(", ")
  end

  defp target_uri(conn), do: scheme(conn) <> "://" <> authority(conn) <> conn.request_path <> query_suffix(conn)

  defp query_suffix(conn), do: if(conn.query_string == "", do: "", else: "?" <> conn.query_string)

  # The sender signed the host it addressed — inkwell.social — but Node's
  # `fetch()` in the inbox proxy rewrites `Host` to the internal API hostname,
  # so the original travels in `x-original-host`. Same reason the Cavage path
  # prefers that header when rebuilding its `host:` line.
  defp authority(conn) do
    case {get_header(conn, "x-original-host"), get_header(conn, "host")} do
      {"", ""} -> conn.host
      {"", host} -> host
      {original, _} -> original
    end
    |> String.downcase()
  end

  # Federation reaches us over https; only local development is plain http.
  defp scheme(conn) do
    host = authority(conn)

    if String.starts_with?(host, "localhost") or String.starts_with?(host, "127.0.0.1") do
      "http"
    else
      "https"
    end
  end

  defp get_header(conn, name) do
    case Plug.Conn.get_req_header(conn, name) do
      [val | _] -> val
      [] -> ""
    end
  end

  defp header(conn, name) do
    case Plug.Conn.get_req_header(conn, name) do
      [val | _] -> {:ok, val}
      [] -> {:error, :no_signature}
    end
  end

  defp decode_public_key(pem) do
    [entry | _] = :public_key.pem_decode(pem)
    :public_key.pem_entry_decode(entry)
  end
end
