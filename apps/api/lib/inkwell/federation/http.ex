defmodule Inkwell.Federation.Http do
  @moduledoc """
  Shared HTTP helpers for federation with proper TLS certificate verification.

  Erlang's :httpc requires explicit SSL options on OTP 25+ to validate
  certificates against the built-in CA store. Without them, connections
  to modern TLS servers (Mastodon, etc.) fail silently.
  """

  require Logger

  @user_agent ~c"Inkwell/0.1 (+https://inkwell.social)"

  # Private/internal IP ranges and hostnames that must never be fetched.
  # Prevents SSRF attacks where malicious AP objects reference internal services.
  @blocked_hostnames ~w(localhost)
  @blocked_tlds ~w(.internal .local .localhost)

  @doc """
  Validates that a URL is safe to fetch (not pointing to internal/private services).
  Returns :ok or {:error, :blocked_url}.
  """
  def validate_url(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{scheme: scheme} when scheme not in ["http", "https"] ->
        {:error, :blocked_url}

      %URI{host: nil} ->
        {:error, :blocked_url}

      %URI{host: host} ->
        host = String.downcase(host)

        cond do
          # Block known internal hostnames
          host in @blocked_hostnames ->
            {:error, :blocked_url}

          # Block internal TLDs (.internal, .local, .localhost)
          Enum.any?(@blocked_tlds, &String.ends_with?(host, &1)) ->
            {:error, :blocked_url}

          # Block IP addresses in private ranges
          is_private_ip?(host) ->
            {:error, :blocked_url}

          true ->
            :ok
        end
    end
  end

  def validate_url(_), do: {:error, :blocked_url}

  defp is_private_ip?(host) do
    case :inet.parse_address(String.to_charlist(host)) do
      {:ok, {127, _, _, _}} -> true
      {:ok, {10, _, _, _}} -> true
      {:ok, {172, b, _, _}} when b >= 16 and b <= 31 -> true
      {:ok, {192, 168, _, _}} -> true
      {:ok, {169, 254, _, _}} -> true  # Link-local / cloud metadata
      {:ok, {0, 0, 0, 0}} -> true
      {:ok, {0, 0, 0, 0, 0, 0, 0, 1}} -> true  # ::1
      {:ok, {0, 0, 0, 0, 0, 0, 0, 0}} -> true  # ::
      {:ok, {0xfe80, _, _, _, _, _, _, _}} -> true  # IPv6 link-local
      {:ok, {0xfc00, _, _, _, _, _, _, _}} -> true  # IPv6 ULA (fc00::/7)
      {:ok, {0xfd00, _, _, _, _, _, _, _}} -> true  # IPv6 ULA
      _ -> false
    end
  end

  # Build SSL options once at module load — :public_key.cacerts_get() is OTP 25+
  # (Dockerfile uses Erlang 27, so this is safe)
  defp ssl_opts do
    [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check,
       [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]
  end

  defp http_opts do
    [
      {:ssl, ssl_opts()},
      {:timeout, 30_000},
      {:connect_timeout, 15_000}
    ]
  end

  @doc """
  Make a signed GET request with federation-appropriate headers.
  `extra_headers` is a list of `{charlist_key, charlist_value}` tuples.
  Returns `{:ok, {status, body_string}}` or `{:error, reason}`.
  """
  def get(url, extra_headers \\ []) do
    case validate_url(url) do
      {:error, :blocked_url} ->
        Logger.warning("Federation HTTP GET blocked — URL targets internal/private address: #{url}")
        {:error, :blocked_url}

      :ok ->
        headers = [{~c"user-agent", @user_agent} | extra_headers]
        url_cl = String.to_charlist(url)

        case :httpc.request(:get, {url_cl, headers}, http_opts(), []) do
          {:ok, {{_, status, _}, _resp_headers, body}} ->
            {:ok, {status, :erlang.list_to_binary(body)}}

          {:error, reason} ->
            Logger.warning("Federation HTTP GET failed for #{url}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc """
  Make a POST request with the given body and headers.
  `headers` should be a list of `{charlist_key, charlist_value}` tuples
  (e.g. from HttpSignature.sign/5 — already in charlist format).
  Returns `:ok` on 2xx, `{:error, {:http_error, status}}` on HTTP errors,
  or `{:error, reason}` on network failures.
  """
  def post(url, body, headers) do
    url_cl = String.to_charlist(url)
    content_type = ~c"application/activity+json"
    # Use :erlang.binary_to_list/1, NOT String.to_charlist/1.
    # String.to_charlist converts UTF-8 to Unicode codepoints (integers > 255),
    # which :httpc can't send as raw bytes, causing silent timeouts.
    # :erlang.binary_to_list preserves the raw UTF-8 byte sequence.
    body_bytes = :erlang.binary_to_list(body)

    case :httpc.request(:post, {url_cl, headers, content_type, body_bytes}, http_opts(), []) do
      {:ok, {{_, status, _}, _resp_headers, resp_body}} when status in 200..299 ->
        Logger.info("Federation POST to #{url} succeeded (#{status})")
        :ok

      {:ok, {{_, status, _}, _resp_headers, resp_body}} ->
        excerpt = resp_body |> to_string() |> String.slice(0..200)
        Logger.warning("Federation POST to #{url} failed: HTTP #{status} — #{excerpt}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Federation POST to #{url} failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
