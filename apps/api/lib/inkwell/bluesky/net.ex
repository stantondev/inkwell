defmodule Inkwell.Bluesky.Net do
  @moduledoc """
  HTTP for the Bluesky (AT Protocol) sign-in and posting.

  Every address here comes from somewhere a member controls (their handle,
  their DID document, their PDS), so each one is checked like a federation
  fetch: https only, no internal hosts, and no redirects (a redirect could
  point anywhere). Tests swap the transport with `config :inkwell,
  :bluesky_req_options, plug: {Req.Test, Inkwell.Bluesky}`.
  """

  require Logger

  @timeout 12_000

  @doc """
  `{:ok, %{status, headers, body}}` or `{:error, reason}`. `opts` are Req
  options (`:form`, `:json`, `:body`, `:headers`, `:params`).
  """
  def request(method, url, opts \\ []) do
    with :ok <- check_url(url) do
      base = [
        method: method,
        url: url,
        redirect: false,
        retry: false,
        receive_timeout: @timeout,
        connect_options: [timeout: 8_000],
        headers: [{"user-agent", "Inkwell (+#{Inkwell.Instance.frontend_url()})"}]
      ]

      req = Req.new(base ++ Application.get_env(:inkwell, :bluesky_req_options, []))

      case Req.request(req, opts) do
        {:ok, %Req.Response{status: status, headers: headers, body: body}} ->
          {:ok, %{status: status, headers: headers, body: body}}

        {:error, reason} ->
          Logger.info("Bluesky request to #{host(url)} failed: #{inspect(reason)}")
          {:error, :unreachable}
      end
    end
  end

  def get_json(url, opts \\ []) do
    case request(:get, url, Keyword.merge([headers: [{"accept", "application/json"}]], opts)) do
      {:ok, %{status: 200, body: body}} when is_map(body) -> {:ok, body}
      {:ok, %{status: 200, body: body}} when is_binary(body) -> decode(body)
      {:ok, %{status: status}} -> {:error, {:http_error, status}}
      error -> error
    end
  end

  @doc "First value of a response header, case-insensitively."
  def header(%{headers: headers}, name) do
    name = String.downcase(name)

    Enum.find_value(headers, fn {k, v} ->
      if String.downcase(k) == name, do: v |> List.wrap() |> List.first()
    end)
  end

  @doc "Decoded JSON body (Req decodes JSON responses; anything else is tried here)."
  def json_body(%{body: body}) when is_map(body), do: body

  def json_body(%{body: body}) when is_binary(body) do
    case decode(body) do
      {:ok, map} -> map
      _ -> %{}
    end
  end

  def json_body(_), do: %{}

  defp decode(body) do
    case Jason.decode(body) do
      {:ok, map} when is_map(map) -> {:ok, map}
      _ -> {:error, :invalid_json}
    end
  end

  defp check_url(url) do
    case URI.parse(url) do
      %URI{scheme: "https", host: host} when is_binary(host) and host != "" ->
        Inkwell.Federation.Http.validate_url(url)

      _ ->
        {:error, :blocked_url}
    end
  end

  defp host(url), do: URI.parse(url).host
end
