defmodule InkwellWeb.GuestbookController do
  use InkwellWeb, :controller

  alias Inkwell.Guestbook
  alias Inkwell.Accounts

  # GET /api/users/:username/guestbook — list entries (public)
  def index(conn, %{"username" => username} = params) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        limit = min(String.to_integer(Map.get(params, "limit", "20")), 50)
        offset = String.to_integer(Map.get(params, "offset", "0"))
        entries = Guestbook.list_entries(user.id, limit: limit, offset: offset)
        count = Guestbook.count_entries(user.id)

        json(conn, %{
          data: Enum.map(entries, &render_entry/1),
          meta: %{total: count}
        })
    end
  end

  # POST /api/users/:username/guestbook — sign guestbook (authenticated)
  def create(conn, %{"username" => username, "body" => body}) do
    current_user = conn.assigns.current_user

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      profile_user ->
        case Guestbook.create_entry(%{
          "body" => body,
          "profile_user_id" => profile_user.id,
          "author_id" => current_user.id
        }) do
          {:ok, entry} ->
            entry = Inkwell.Repo.preload(entry, :author)
            conn |> put_status(:created) |> json(%{data: render_entry(entry)})

          {:error, changeset} ->
            errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
            conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
        end
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing body parameter"})
  end

  # DELETE /api/guestbook/:id — delete entry (author or profile owner)
  def delete(conn, %{"id" => id}) do
    current_user = conn.assigns.current_user

    case Guestbook.delete_entry(id, current_user.id) do
      {:ok, _} ->
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not authorized to delete this entry"})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to delete entry"})
    end
  end

  defp render_entry(entry) do
    %{
      id: entry.id,
      body: entry.body,
      created_at: entry.inserted_at,
      author: if(entry.author, do: %{
        id: entry.author.id,
        username: entry.author.username,
        display_name: entry.author.display_name,
        avatar_url: entry.author.avatar_url
      }, else: nil)
    }
  end
end
