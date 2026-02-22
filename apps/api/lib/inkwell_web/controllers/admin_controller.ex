defmodule InkwellWeb.AdminController do
  use InkwellWeb, :controller

  alias Inkwell.Journals
  alias InkwellWeb.EntryController

  # GET /api/admin/entries
  def list_entries(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 50)

    entries = Journals.list_all_entries(page: page, per_page: per_page)

    json(conn, %{
      data: Enum.map(entries, fn entry ->
        EntryController.render_entry(entry)
        |> Map.put(:author, %{
          username: entry.user.username,
          display_name: entry.user.display_name,
          avatar_url: entry.user.avatar_url
        })
      end),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # DELETE /api/admin/entries/:id
  def delete_entry(conn, %{"id" => id}) do
    try do
      entry = Journals.get_entry!(id)
      {:ok, _} = Journals.delete_entry(entry)
      send_resp(conn, :no_content, "")
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, _) when is_integer(val), do: val
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
end
