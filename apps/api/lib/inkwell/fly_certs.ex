defmodule Inkwell.FlyCerts do
  @moduledoc """
  Client for the Fly.io Certificates API.
  Manages TLS certificates for custom domains on the inkwell-web app.
  Uses :httpc (same pattern as billing.ex, email.ex, slack.ex).
  """

  require Logger

  @fly_api "https://api.machines.dev"
  @app_name "inkwell-web"

  # ── Public API ──

  @doc "Request a Let's Encrypt certificate for the given hostname."
  def request_certificate(hostname) do
    fly_post("/v1/apps/#{@app_name}/certificates/acme", %{"hostname" => hostname})
  end

  @doc "Trigger a fresh DNS validation check for the given hostname."
  def check_certificate(hostname) do
    fly_post("/v1/apps/#{@app_name}/certificates/#{URI.encode(hostname)}/check", %{})
  end

  @doc "Retrieve certificate details for the given hostname."
  def get_certificate(hostname) do
    fly_get("/v1/apps/#{@app_name}/certificates/#{URI.encode(hostname)}")
  end

  @doc "Remove hostname and all associated certificates."
  def delete_certificate(hostname) do
    fly_delete("/v1/apps/#{@app_name}/certificates/#{URI.encode(hostname)}")
  end

  # ── Private HTTP helpers ──

  defp fly_token do
    Application.get_env(:inkwell, :fly_api_token)
  end

  defp fly_post(path, body) do
    token = fly_token()

    if is_nil(token) or token == "" do
      Logger.warning("[FlyCerts] FLY_API_TOKEN not set — cannot manage certificates")
      {:error, :fly_not_configured}
    else
      url = String.to_charlist("#{@fly_api}#{path}")
      body_json = Jason.encode!(body)

      headers = [
        {~c"authorization", String.to_charlist("Bearer #{token}")},
        {~c"content-type", ~c"application/json"}
      ]

      case :httpc.request(:post, {url, headers, ~c"application/json", String.to_charlist(body_json)},
             [ssl: [verify: :verify_none]], []) do
        {:ok, {{_, status, _}, _h, resp}} when status in 200..299 ->
          {:ok, Jason.decode!(:erlang.list_to_binary(resp))}

        {:ok, {{_, status, _}, _h, resp}} ->
          body = :erlang.list_to_binary(resp)
          Logger.error("[FlyCerts] POST #{path} returned #{status}: #{body}")
          {:error, {:fly_error, status, body}}

        {:error, reason} ->
          Logger.error("[FlyCerts] HTTP error on POST #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp fly_get(path) do
    token = fly_token()

    if is_nil(token) or token == "" do
      {:error, :fly_not_configured}
    else
      url = String.to_charlist("#{@fly_api}#{path}")
      headers = [{~c"authorization", String.to_charlist("Bearer #{token}")}]

      case :httpc.request(:get, {url, headers},
             [ssl: [verify: :verify_none]], []) do
        {:ok, {{_, status, _}, _h, resp}} when status in 200..299 ->
          {:ok, Jason.decode!(:erlang.list_to_binary(resp))}

        {:ok, {{_, status, _}, _h, resp}} ->
          {:error, {:fly_error, status, :erlang.list_to_binary(resp)}}

        {:error, reason} ->
          Logger.error("[FlyCerts] HTTP error on GET #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp fly_delete(path) do
    token = fly_token()

    if is_nil(token) or token == "" do
      {:error, :fly_not_configured}
    else
      url = String.to_charlist("#{@fly_api}#{path}")
      headers = [{~c"authorization", String.to_charlist("Bearer #{token}")}]

      case :httpc.request(:delete, {url, headers},
             [ssl: [verify: :verify_none]], []) do
        {:ok, {{_, status, _}, _h, _resp}} when status in 200..204 ->
          :ok

        {:ok, {{_, status, _}, _h, resp}} ->
          {:error, {:fly_error, status, :erlang.list_to_binary(resp)}}

        {:error, reason} ->
          Logger.error("[FlyCerts] HTTP error on DELETE #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end
end
