defmodule InkwellWeb.UserIconController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts

  # GET /api/me/icons
  def index(conn, _params) do
    icons = Accounts.list_user_icons(conn.assigns.current_user.id)
    json(conn, %{data: Enum.map(icons, &render_icon/1)})
  end

  # POST /api/me/icons
  # Body: { "image_url": "...", "keyword": "coffee", "is_default": false }
  def create(conn, params) do
    attrs = Map.merge(params, %{"user_id" => conn.assigns.current_user.id})

    case Accounts.create_user_icon(attrs) do
      {:ok, icon} ->
        conn |> put_status(:created) |> json(%{data: render_icon(icon)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # DELETE /api/me/icons/:id
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user
    icons = Accounts.list_user_icons(user.id)

    case Enum.find(icons, &(&1.id == id)) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Icon not found"})

      icon ->
        {:ok, _} = Accounts.delete_user_icon(icon)
        send_resp(conn, :no_content, "")
    end
  end

  defp render_icon(icon) do
    %{
      id: icon.id,
      user_id: icon.user_id,
      image_url: icon.image_url,
      keyword: icon.keyword,
      is_default: icon.is_default,
      sort_order: icon.sort_order
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
