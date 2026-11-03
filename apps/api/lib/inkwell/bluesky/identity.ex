defmodule Inkwell.Bluesky.Identity do
  @moduledoc """
  Who someone is on the AT Protocol, and which server signs them in.

      handle ──DNS TXT / .well-known──▶ DID ──DID document──▶ PDS
        PDS ──/.well-known/oauth-protected-resource──▶ authorization server
        authorization server ──/.well-known/oauth-authorization-server──▶ endpoints

  A handle only counts when the DID document names it back (the spec calls
  this bidirectional verification). After sign-in the DID in the token
  response is resolved again from scratch, and its PDS must point at the
  same authorization server, or anyone running an authorization server
  could claim any account (`verify_sub/2`).
  """

  alias Inkwell.Bluesky.Net

  @default_entryway "https://bsky.social"
  @plc_directory "https://plc.directory"

  @handle_re ~r/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/
  @did_re ~r/^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.\-%]+)$/

  @doc """
  Resolve what someone typed (a handle, a DID, or nothing) to
  `%{did, handle, pds_url, issuer, metadata}`. With nothing typed we start
  at Bluesky's own sign-in (did/handle nil; they choose the account there).
  """
  def resolve(input) do
    case normalize(input) do
      :blank -> entryway()
      {:did, did} -> from_did(did, nil)
      {:handle, handle} -> with {:ok, did} <- resolve_handle(handle), do: from_did(did, handle)
      :invalid -> {:error, :invalid_handle}
    end
  end

  @doc "Turn what someone typed into a handle or DID: \"@Alice.bsky.social\" → alice.bsky.social, \"alice\" → alice.bsky.social."
  def normalize(input) when is_binary(input) do
    value = input |> String.trim() |> String.trim_leading("@") |> String.trim_leading("at://")

    cond do
      value == "" -> :blank
      String.starts_with?(value, "did:") -> if Regex.match?(@did_re, value), do: {:did, value}, else: :invalid
      true ->
        handle = String.downcase(value)
        handle = if String.contains?(handle, "."), do: handle, else: handle <> ".bsky.social"
        if Regex.match?(@handle_re, handle) and byte_size(handle) <= 253, do: {:handle, handle}, else: :invalid
    end
  end

  def normalize(_), do: :blank

  @doc """
  After sign-in: resolve `did` fresh and check its PDS is served by `issuer`.
  Returns `{:ok, %{did, handle, pds_url}}`.
  """
  def verify_sub(did, issuer) do
    with true <- is_binary(did) and Regex.match?(@did_re, did) || {:error, :bad_sub},
         {:ok, doc} <- did_document(did),
         {:ok, pds} <- pds_from(doc),
         {:ok, as_url} <- authorization_server_for(pds) do
      if same_origin?(as_url, issuer),
        do: {:ok, %{did: did, handle: handle_from(doc), pds_url: pds}},
        else: {:error, :issuer_mismatch}
    end
  end

  @doc "Authorization server metadata, checked: issuer matches where we fetched it."
  def server_metadata(as_url) do
    origin = origin(as_url)

    with {:ok, meta} <- Net.get_json(origin <> "/.well-known/oauth-authorization-server"),
         true <- meta["issuer"] == origin || {:error, :issuer_mismatch},
         true <- is_binary(meta["pushed_authorization_request_endpoint"]) || {:error, :no_par},
         true <- is_binary(meta["token_endpoint"]) || {:error, :no_token_endpoint},
         true <- is_binary(meta["authorization_endpoint"]) || {:error, :no_authorize_endpoint} do
      {:ok, meta}
    end
  end

  # ── Steps ──────────────────────────────────────────────────────────

  defp entryway do
    entry = Application.get_env(:inkwell, :bluesky_entryway, @default_entryway)

    # bsky.social is itself the authorization server (the "entryway");
    # a PDS address points at one through its protected-resource metadata.
    as_url =
      case authorization_server_for(entry) do
        {:ok, url} -> url
        _ -> entry
      end

    with {:ok, meta} <- server_metadata(as_url) do
      {:ok, %{did: nil, handle: nil, pds_url: nil, issuer: meta["issuer"], metadata: meta}}
    end
  end

  defp from_did(did, typed_handle) do
    with {:ok, doc} <- did_document(did),
         :ok <- check_handle(doc, typed_handle),
         {:ok, pds} <- pds_from(doc),
         {:ok, as_url} <- authorization_server_for(pds),
         {:ok, meta} <- server_metadata(as_url) do
      {:ok, %{did: did, handle: handle_from(doc), pds_url: pds, issuer: meta["issuer"], metadata: meta}}
    end
  end

  @doc false
  def resolve_handle(handle) do
    case dns_did(handle) do
      {:ok, did} -> {:ok, did}
      _ -> well_known_did(handle)
    end
  end

  defp dns_did(handle) do
    lookup = Application.get_env(:inkwell, :bluesky_dns_lookup, &default_dns_lookup/1)

    lookup.("_atproto." <> handle)
    |> Enum.find_value(:error, fn
      "did=" <> did -> if Regex.match?(@did_re, did), do: {:ok, did}
      _ -> nil
    end)
  end

  defp default_dns_lookup(name) do
    :inet_res.lookup(String.to_charlist(name), :in, :txt, timeout: 4_000)
    |> Enum.map(fn parts -> parts |> Enum.map(&to_string/1) |> Enum.join() end)
  rescue
    _ -> []
  end

  defp well_known_did(handle) do
    case Net.request(:get, "https://#{handle}/.well-known/atproto-did") do
      {:ok, %{status: 200, body: body}} when is_binary(body) ->
        did = String.trim(body)
        if Regex.match?(@did_re, did), do: {:ok, did}, else: {:error, :handle_not_found}

      _ ->
        {:error, :handle_not_found}
    end
  end

  @doc false
  def did_document("did:plc:" <> _ = did) do
    plc = Application.get_env(:inkwell, :bluesky_plc_directory, @plc_directory)
    did_doc_at(plc <> "/" <> did, did)
  end

  def did_document("did:web:" <> host = did) do
    host = URI.decode(host)
    if String.contains?(host, [":", "/"]), do: {:error, :unsupported_did}, else: did_doc_at("https://#{host}/.well-known/did.json", did)
  end

  def did_document(_), do: {:error, :unsupported_did}

  defp did_doc_at(url, did) do
    case Net.get_json(url) do
      {:ok, %{"id" => ^did} = doc} -> {:ok, doc}
      {:ok, _} -> {:error, :did_mismatch}
      _ -> {:error, :did_not_found}
    end
  end

  defp check_handle(_doc, nil), do: :ok

  defp check_handle(doc, handle) do
    if handle_from(doc) == handle, do: :ok, else: {:error, :handle_mismatch}
  end

  @doc false
  def handle_from(doc) do
    (doc["alsoKnownAs"] || [])
    |> Enum.find_value(fn
      "at://" <> handle -> String.downcase(handle)
      _ -> nil
    end)
  end

  defp pds_from(doc) do
    (doc["service"] || [])
    |> Enum.find_value({:error, :no_pds}, fn service ->
      id = service["id"] || ""

      if (id == "#atproto_pds" or String.ends_with?(id, "#atproto_pds")) and
           service["type"] == "AtprotoPersonalDataServer" and is_binary(service["serviceEndpoint"]) do
        {:ok, String.trim_trailing(service["serviceEndpoint"], "/")}
      end
    end)
  end

  defp authorization_server_for(pds) do
    case Net.get_json(origin(pds) <> "/.well-known/oauth-protected-resource") do
      {:ok, %{"authorization_servers" => [as_url | _]}} when is_binary(as_url) -> {:ok, origin(as_url)}
      {:ok, _} -> {:error, :no_authorization_server}
      error -> error
    end
  end

  defp same_origin?(a, b), do: is_binary(a) and is_binary(b) and origin(a) == origin(b)

  @doc false
  def origin(url) do
    uri = URI.parse(url)
    port = if uri.port && uri.port != URI.default_port(uri.scheme || "https"), do: ":#{uri.port}", else: ""
    "#{uri.scheme}://#{uri.host}#{port}"
  end
end
