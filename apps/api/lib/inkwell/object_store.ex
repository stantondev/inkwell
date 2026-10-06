defmodule Inkwell.ObjectStore do
  @moduledoc """
  Where uploaded image files live when a bucket is configured.

  On inkwell.social that's a private Tigris bucket (`inkwell-images`, made
  with `fly storage create`, which sets BUCKET_NAME, AWS_ENDPOINT_URL_S3,
  AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on inkwell-api).
  Any S3-compatible service works the same way. With no bucket configured
  (local dev, self-hosted servers by default) `configured?/0` is false and
  images stay in Postgres, so both paths must keep working.

  Readers never see the bucket: images are still served at
  `/api/images/:id`, which reads the object here (see Inkwell.Images).

  Tests use `Inkwell.ObjectStore.Memory` via
  `config :inkwell, :object_store_adapter`.
  """

  @callback put(key :: String.t(), body :: binary(), content_type :: String.t()) ::
              :ok | {:error, term()}
  @callback get(key :: String.t()) :: {:ok, binary()} | {:error, :not_found | term()}
  @callback delete(key :: String.t()) :: :ok | {:error, term()}

  @doc "The adapter in use, or nil when images stay in Postgres."
  def adapter do
    case Application.get_env(:inkwell, :object_store_adapter) do
      nil -> if Inkwell.ObjectStore.S3.configured?(), do: Inkwell.ObjectStore.S3
      adapter -> adapter
    end
  end

  def configured?, do: adapter() != nil

  def put(key, body, content_type), do: call(:put, [key, body, content_type])
  def get(key), do: call(:get, [key])
  def delete(key), do: call(:delete, [key])

  defp call(fun, args) do
    case adapter() do
      nil -> {:error, :not_configured}
      adapter -> apply(adapter, fun, args)
    end
  end
end
