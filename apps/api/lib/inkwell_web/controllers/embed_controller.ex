defmodule InkwellWeb.EmbedController do
  use InkwellWeb, :controller

  alias Inkwell.Embeds

  def fetch(conn, %{"url" => url}) when is_binary(url) and url != "" do
    case Embeds.fetch_url_metadata(url) do
      {:ok, metadata} ->
        json(conn, %{data: metadata})

      {:error, :https_only} ->
        conn |> put_status(422) |> json(%{error: "Only HTTPS URLs are supported"})

      {:error, :invalid_url} ->
        conn |> put_status(422) |> json(%{error: "Invalid URL"})

      {:error, :blocked_host} ->
        conn |> put_status(422) |> json(%{error: "This URL cannot be embedded"})

      {:error, :not_html} ->
        conn |> put_status(422) |> json(%{error: "URL does not point to a web page"})

      {:error, :no_metadata} ->
        conn |> put_status(422) |> json(%{error: "Could not extract metadata from this URL"})

      {:error, {:http_error, status}} ->
        conn |> put_status(422) |> json(%{error: "URL returned HTTP #{status}"})

      {:error, _} ->
        conn |> put_status(422) |> json(%{error: "Could not fetch URL"})
    end
  end

  def fetch(conn, _params) do
    conn |> put_status(422) |> json(%{error: "URL is required"})
  end
end
