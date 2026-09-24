defmodule InkwellWeb.UserIconController do
  @moduledoc "Userpics (see Inkwell.Userpics): the writer's set, and serving the pictures."
  use InkwellWeb, :controller

  alias Inkwell.Userpics

  # GET /api/me/icons
  def index(conn, _params) do
    user = conn.assigns.current_user
    icons = Userpics.list(user.id)

    json(conn, %{
      data: Enum.map(icons, &Userpics.render/1),
      meta: %{count: length(icons), limit: Userpics.limit(user)}
    })
  end

  # POST /api/me/icons  {data: "data:image/...;base64,...", keyword}
  def create(conn, params) do
    case Userpics.create(conn.assigns.current_user, params) do
      {:ok, icon} -> conn |> put_status(:created) |> json(%{data: Userpics.render(icon)})
      {:error, %Ecto.Changeset{} = cs} -> unprocessable(conn, cs)
      {:error, message} -> conn |> put_status(:unprocessable_entity) |> json(%{error: message})
    end
  end

  # PATCH /api/me/icons/:id  {keyword?, sort_order?}
  def update(conn, %{"id" => id} = params) do
    case Userpics.get_owned(conn.assigns.current_user.id, id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Userpic not found"})

      icon ->
        case Userpics.update(icon, params) do
          {:ok, icon} -> json(conn, %{data: Userpics.render(icon)})
          {:error, cs} -> unprocessable(conn, cs)
        end
    end
  end

  # DELETE /api/me/icons/:id — entries and comments that used it go back to the avatar.
  def delete(conn, %{"id" => id}) do
    case Userpics.get_owned(conn.assigns.current_user.id, id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Userpic not found"})

      icon ->
        {:ok, _} = Userpics.delete(icon)
        send_resp(conn, :no_content, "")
    end
  end

  # GET /api/userpics/:id (public). A picture never changes under its id.
  def show(conn, %{"id" => id}) do
    with %{} = icon <- Userpics.get(id),
         {:ok, type, binary} <- Userpics.decode(icon) do
      conn
      |> put_resp_content_type(type)
      |> put_resp_header("cache-control", "public, max-age=31536000, immutable")
      |> put_resp_header("x-content-type-options", "nosniff")
      |> send_resp(200, binary)
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  defp unprocessable(conn, changeset) do
    errors =
      Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
        Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
          opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
        end)
      end)

    message =
      case errors do
        %{keyword: [m | _]} -> "Keyword #{m}."
        _ -> "That didn't save."
      end

    conn |> put_status(:unprocessable_entity) |> json(%{error: message, errors: errors})
  end
end
