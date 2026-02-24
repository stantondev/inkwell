defmodule InkwellWeb.BookmarkController do
  use InkwellWeb, :controller

  alias Inkwell.{Bookmarks, Stamps}
  alias InkwellWeb.EntryController

  # POST /api/entries/:entry_id/bookmark — save an entry to reading list
  def create(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user

    case Bookmarks.bookmark_entry(user.id, entry_id) do
      {:ok, _bookmark} ->
        json(conn, %{data: %{bookmarked: true}})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  # DELETE /api/entries/:entry_id/bookmark — remove from reading list
  def delete(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user
    Bookmarks.remove_bookmark(user.id, entry_id)
    json(conn, %{data: %{bookmarked: false}})
  end

  # GET /api/bookmarks — list current user's reading list
  def index(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    bookmarks = Bookmarks.list_user_bookmarks(user.id, page: page, per_page: per_page)

    entry_ids = Enum.map(bookmarks, fn {entry, _author, _saved_at} -> entry.id end)
    stamp_types_map = Stamps.get_stamp_types_for_entries(entry_ids)

    json(conn, %{
      data: Enum.map(bookmarks, fn {entry, author, saved_at} ->
        EntryController.render_entry(entry)
        |> Map.merge(%{
          author: %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url
          },
          stamps: Map.get(stamp_types_map, entry.id, []),
          saved_at: saved_at,
          bookmarked: true
        })
      end),
      pagination: %{page: page, per_page: per_page}
    })
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
