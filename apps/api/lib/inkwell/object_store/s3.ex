defmodule Inkwell.ObjectStore.S3 do
  @moduledoc """
  S3-compatible object storage (Tigris on inkwell.social) over Req, which
  signs requests with AWS SigV4. Path-style URLs: `<endpoint>/<bucket>/<key>`.
  """
  @behaviour Inkwell.ObjectStore

  require Logger

  def configured? do
    cfg = config()
    Enum.all?([:bucket, :endpoint, :access_key_id, :secret_access_key], &present?(cfg[&1]))
  end

  @impl true
  def put(key, body, content_type) do
    case Req.put(req(), url: path(key), body: body, headers: [{"content-type", content_type}]) do
      {:ok, %{status: status}} when status in 200..299 -> :ok
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, snippet(body)}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def get(key) do
    case Req.get(req(), url: path(key)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 404}} -> {:error, :not_found}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, snippet(body)}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def delete(key) do
    case Req.delete(req(), url: path(key)) do
      {:ok, %{status: status}} when status in [200, 204, 404] -> :ok
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, snippet(body)}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp req do
    cfg = config()

    Req.new(
      base_url: String.trim_trailing(cfg[:endpoint], "/") <> "/" <> cfg[:bucket],
      aws_sigv4: [
        access_key_id: cfg[:access_key_id],
        secret_access_key: cfg[:secret_access_key],
        service: :s3,
        region: cfg[:region] || "auto"
      ],
      # Bytes in, bytes out: no gzip negotiation or body decoding.
      compressed: false,
      decode_body: false,
      # PUT and DELETE of a key are idempotent, so transient failures retry.
      retry: :transient,
      max_retries: 2,
      receive_timeout: 30_000
    )
  end

  # Keys are ours ("images/<uuid>"), but encode each segment anyway.
  defp path(key), do: "/" <> (key |> String.split("/") |> Enum.map_join("/", &URI.encode_www_form/1))

  defp config, do: Application.get_env(:inkwell, :object_store) || []

  defp present?(v), do: is_binary(v) and v != ""

  defp snippet(body) when is_binary(body), do: String.slice(body, 0, 200)
  defp snippet(_), do: nil
end
