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

  # Per-domain rate limiting for outbound GET requests.
  # Prevents DDoS amplification: a flood of inbound activities with different actor URIs
  # on the same domain would cause us to hammer that domain with fetches.
  @domain_rate_table :federation_domain_rate
  @domain_rate_window_ms 5_000  # 5-second window
  @domain_rate_max 10  # max 10 requests per domain per window

  @doc """
  Checks per-domain rate limit for outbound federation fetches.
  Returns :ok or {:error, :domain_rate_limited}.
  """
  def check_domain_rate(url) do
    ensure_domain_rate_table()
    domain = URI.parse(url) |> Map.get(:host, "unknown") |> String.downcase()
    now = System.system_time(:millisecond)
    window_start = now - @domain_rate_window_ms
    key = {:domain_rate, domain}

    case :ets.lookup(@domain_rate_table, key) do
      [{^key, timestamps}] ->
        recent = Enum.filter(timestamps, &(&1 > window_start))
        if length(recent) >= @domain_rate_max do
          {:error, :domain_rate_limited}
        else
          :ets.insert(@domain_rate_table, {key, Enum.take([now | recent], @domain_rate_max)})
          :ok
        end

      [] ->
        :ets.insert(@domain_rate_table, {key, [now]})
        :ok
    end
  end

  defp ensure_domain_rate_table do
    if :ets.whereis(@domain_rate_table) == :undefined do
      :ets.new(@domain_rate_table, [:set, :public, :named_table])
    end
  rescue
    ArgumentError -> :ok
  end

  # Build SSL options once at module load — :public_key.cacerts_get() is OTP 25+
  # (Dockerfile uses Erlang 27, so this is safe)
  #
  # Aggressive timeouts: 5s end-to-end, 3s connect. These bound the worst case
  # for a synchronous outbound fetch inside an inbox POST. A healthy fediverse
  # server responds in <1s; anything slower is broken or hostile and we should
  # reject the activity (Mastodon will retry with backoff). Mastodon, Pleroma,
  # and GoToSocial all use 5-10s outbound timeouts for federation fetches.
  #
  # The 30s/15s previous values let a single slow remote tie up a Phoenix
  # process for 30 seconds, contributing to the multi-endpoint slowdowns
  # observed at peak fan-out times.
  defp http_opts(extra \\ []) do
    Keyword.merge(
      [
        {:ssl, Inkwell.SSL.httpc_opts()},
        {:timeout, 5_000},
        {:connect_timeout, 3_000}
      ],
      extra
    )
  end

  @doc """
  Make a signed GET request with federation-appropriate headers.
  `extra_headers` is a list of `{charlist_key, charlist_value}` tuples.
  Returns `{:ok, {status, body_string}}` or `{:error, reason}`.
  """
  # `opts`: `follow_redirects: false` stops :httpc following redirects, which
  # would otherwise skip `validate_url/1` for the redirect target. Use it for
  # fetches of links people paste.
  def get(url, extra_headers \\ [], opts \\ []) do
    case validate_url(url) do
      {:error, :blocked_url} ->
        Logger.warning("Federation HTTP GET blocked — URL targets internal/private address: #{url}")
        {:error, :blocked_url}

      :ok ->
        case check_domain_rate(url) do
          {:error, :domain_rate_limited} ->
            Logger.warning("Federation HTTP GET rate-limited for domain in #{url}")
            {:error, :domain_rate_limited}

          :ok ->
        headers = [{~c"user-agent", @user_agent} | extra_headers]
        url_cl = String.to_charlist(url)

        redirect_opts =
          if Keyword.get(opts, :follow_redirects, true), do: [], else: [{:autoredirect, false}]

        # `timeout:` for the few non-federation reads that are slow by nature
        # (Mastodon's link timeline); federation fetches keep the 5s default.
        timeout_opts =
          case Keyword.get(opts, :timeout) do
            ms when is_integer(ms) -> [{:timeout, ms}]
            _ -> []
          end

        case :httpc.request(:get, {url_cl, headers}, http_opts(redirect_opts ++ timeout_opts), []) do
          {:ok, {{_, status, _}, _resp_headers, body}} ->
            {:ok, {status, :erlang.list_to_binary(body)}}

          {:error, reason} ->
            Logger.warning("Federation HTTP GET failed for #{url}: #{inspect(reason)}")
            {:error, reason}
        end
        end  # end domain rate check
    end
  end

  @ap_accept ~c"application/activity+json, application/ld+json"

  @doc """
  Fetches an ActivityPub object as a map. Tries an unsigned GET first and
  retries signed with the instance actor's key when the server answers 401 or
  403 (authorized fetch / secure mode).
  Returns `{:ok, map}`, `{:error, {:http_error, status}}` or `{:error, reason}`.
  """
  def get_object(url) when is_binary(url) do
    case get_map(url, [{~c"accept", @ap_accept}]) do
      {:error, {:http_error, status}} when status in [401, 403] ->
        case Inkwell.Federation.RemoteActor.instance_signing_headers(url) do
          {:ok, signed} -> get_map(url, signed)
          :error -> {:error, {:http_error, status}}
        end

      other ->
        other
    end
  end

  def get_object(_), do: {:error, :invalid_url}

  @doc """
  GETs a JSON API endpoint (Mastodon's public API). Returns `{:ok, decoded}`
  or an error. Doesn't follow redirects, which would skip `validate_url/1`.
  """
  def get_json(url) when is_binary(url) do
    get_decoded(url, [{~c"accept", ~c"application/json"}], follow_redirects: false)
  end

  @doc """
  POSTs a JSON body to a public API endpoint (Misskey's `notes/show`) and
  decodes the answer. Same URL checks and per-domain limit as `get/3`.
  """
  def post_json(url, body) when is_binary(url) and is_map(body) do
    with :ok <- validate_url(url),
         :ok <- check_domain_rate(url) do
      headers = [{~c"user-agent", @user_agent}, {~c"accept", ~c"application/json"}]
      payload = :erlang.binary_to_list(Jason.encode!(body))

      case :httpc.request(:post, {String.to_charlist(url), headers, ~c"application/json", payload}, http_opts([{:autoredirect, false}]), []) do
        {:ok, {{_, status, _}, _headers, resp}} when status in 200..299 ->
          Jason.decode(:erlang.list_to_binary(resp))

        {:ok, {{_, status, _}, _headers, _resp}} ->
          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  defp get_map(url, headers) do
    case get_decoded(url, headers) do
      {:ok, %{} = map} -> {:ok, map}
      {:ok, _} -> {:error, :invalid_json}
      error -> error
    end
  end

  defp get_decoded(url, headers, opts \\ []) do
    case get(url, headers, opts) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, decoded} -> {:ok, decoded}
          {:error, _} -> {:error, :invalid_json}
        end

      {:ok, {status, _}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
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
      {:ok, {{_, status, _}, _resp_headers, _resp_body}} when status in 200..299 ->
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
