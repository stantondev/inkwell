defmodule InkwellWeb.UserStickerController do
  @moduledoc "The signed-in writer's own stickers (Inkwell.Stickers)."
  use InkwellWeb, :controller

  alias Inkwell.Stickers

  # GET /api/me/stickers
  def index(conn, _params) do
    user = conn.assigns.current_user
    stickers = Stickers.list(user.id)

    json(conn, %{
      data: Enum.map(stickers, &Stickers.render/1),
      meta: %{
        count: length(stickers),
        limit: Stickers.limit(user),
        max_bytes: Stickers.max_bytes(),
        blocked_reason: Stickers.upload_blocked_reason(user)
      }
    })
  end

  # POST /api/me/stickers  {data, name?, outline?, ratio?}
  def create(conn, params) do
    case Stickers.create(conn.assigns.current_user, params) do
      {:ok, sticker} -> conn |> put_status(:created) |> json(%{data: Stickers.render(sticker)})
      {:error, message} -> conn |> put_status(:unprocessable_entity) |> json(%{error: message})
    end
  end

  # PATCH /api/me/stickers/:id  {name?, outline?}
  def update(conn, %{"id" => id} = params) do
    with %{} = sticker <- Stickers.get_owned(conn.assigns.current_user.id, id),
         {:ok, sticker} <- Stickers.update(sticker, params) do
      json(conn, %{data: Stickers.render(sticker)})
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "Sticker not found"})
      {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Couldn't save that."})
    end
  end

  # DELETE /api/me/stickers/:id: the picture and every copy on the page.
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case Stickers.get_owned(user.id, id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Sticker not found"})

      sticker ->
        {:ok, :ok} = Stickers.delete(user, sticker)
        send_resp(conn, :no_content, "")
    end
  end
end
