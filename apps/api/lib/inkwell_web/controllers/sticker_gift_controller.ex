defmodule InkwellWeb.StickerGiftController do
  @moduledoc "Stickers pen pals give each other (Inkwell.StickerGifts)."
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, StickerGifts}

  # GET /api/me/sticker-gifts
  def index(conn, _params) do
    user = conn.assigns.current_user
    json(conn, %{data: Enum.map(StickerGifts.list_for(user.id), &StickerGifts.render/1)})
  end

  # POST /api/users/:username/sticker-gifts  {"key" | "sticker_id", "note"}
  def create(conn, %{"username" => username} = params) do
    giver = conn.assigns.current_user

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      recipient ->
        case StickerGifts.give(giver, recipient, params) do
          {:ok, gift} ->
            conn |> put_status(:created) |> json(%{data: StickerGifts.render(gift)})

          {:error, message} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: message})
        end
    end
  end

  # DELETE /api/me/sticker-gifts/:id  (put a gift away)
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case StickerGifts.get_received(user.id, id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Gift not found"})

      gift ->
        {:ok, :ok} = StickerGifts.put_away(user, gift)
        send_resp(conn, :no_content, "")
    end
  end
end
