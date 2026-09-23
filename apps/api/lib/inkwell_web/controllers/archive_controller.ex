defmodule InkwellWeb.ArchiveController do
  use InkwellWeb, :controller

  alias Inkwell.Journals.Archive

  # GET /api/me/archive
  def show(conn, _params) do
    json(conn, %{data: Archive.summary(conn.assigns.current_user)})
  end

  # PATCH /api/me/archive — {archive_mark: bool, origin?: string} and/or {note: string}
  def update(conn, params) do
    user = conn.assigns.current_user

    changed =
      case params["archive_mark"] do
        on? when is_boolean(on?) -> Archive.set_mark(user.id, on?, blank_to_nil(params["origin"]))
        _ -> 0
      end

    case params["note"] do
      note when is_binary(note) ->
        case Archive.set_note(user, note) do
          {:ok, user} -> json(conn, %{data: Archive.summary(user) |> Map.put(:changed, changed)})
          {:error, message} when is_binary(message) -> conn |> put_status(:unprocessable_entity) |> json(%{error: message})
          {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Couldn't save the note."})
        end

      _ ->
        json(conn, %{data: Archive.summary(user) |> Map.put(:changed, changed)})
    end
  end

  defp blank_to_nil(s) when is_binary(s) and s != "", do: s
  defp blank_to_nil(_), do: nil
end
