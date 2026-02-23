defmodule Inkwell.Federation.Http do
  @moduledoc """
  Shared HTTP helpers for federation with proper TLS certificate verification.

  Erlang's :httpc requires explicit SSL options on OTP 25+ to validate
  certificates against the built-in CA store. Without them, connections
  to modern TLS servers (Mastodon, etc.) fail silently.
  """

  require Logger

  @user_agent ~c"Inkwell/0.1 (+https://inkwell.social)"

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
      {:timeout, 15_000},
      {:connect_timeout, 10_000}
    ]
  end

  @doc """
  Make a signed GET request with federation-appropriate headers.
  `extra_headers` is a list of `{charlist_key, charlist_value}` tuples.
  Returns `{:ok, {status, body_string}}` or `{:error, reason}`.
  """
  def get(url, extra_headers \\ []) do
    headers = [{~c"user-agent", @user_agent} | extra_headers]
    url_cl = String.to_charlist(url)

    case :httpc.request(:get, {url_cl, headers}, http_opts(), []) do
      {:ok, {{_, status, _}, _resp_headers, body}} ->
        {:ok, {status, to_string(body)}}

      {:error, reason} ->
        Logger.warning("Federation HTTP GET failed for #{url}: #{inspect(reason)}")
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
    body_cl = String.to_charlist(body)

    case :httpc.request(:post, {url_cl, headers, content_type, body_cl}, http_opts(), []) do
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
