defmodule InkwellWeb.MediaEmbedController do
  use InkwellWeb, :controller

  alias Inkwell.MediaEmbeds

  # GET /api/media/resolve?url= — the player for a fediverse media link
  # (PeerTube, Funkwhale, Castopod, Owncast), looked up when a writer pastes it.
  def resolve(conn, %{"url" => url}) when is_binary(url) and byte_size(url) <= 2000 do
    case MediaEmbeds.resolve(url) do
      {:ok, meta} -> json(conn, %{data: meta})
      {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "unsupported"})
    end
  end

  def resolve(conn, _params),
    do: conn |> put_status(:bad_request) |> json(%{error: "url is required"})
end
