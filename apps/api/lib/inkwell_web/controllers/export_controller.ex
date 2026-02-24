defmodule InkwellWeb.ExportController do
  use InkwellWeb, :controller

  alias Inkwell.Export

  def create(conn, _params) do
    user = conn.assigns.current_user

    if Export.has_active_export?(user.id) do
      conn
      |> put_status(:conflict)
      |> json(%{error: "An export is already in progress. Please wait for it to complete."})
    else
      case Export.create_export(user.id) do
        {:ok, export} ->
          %{export_id: export.id, user_id: user.id}
          |> Inkwell.Workers.ExportDataWorker.new()
          |> Oban.insert()

          conn
          |> put_status(:created)
          |> json(%{data: render_export(export)})

        {:error, _changeset} ->
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Failed to create export request."})
      end
    end
  end

  def status(conn, _params) do
    user = conn.assigns.current_user

    case Export.get_latest_export(user.id) do
      nil ->
        json(conn, %{data: nil})

      export ->
        json(conn, %{data: render_export(export)})
    end
  end

  def download(conn, _params) do
    user = conn.assigns.current_user

    case Export.get_latest_export(user.id) do
      %{status: "completed", data: data} = export when not is_nil(data) ->
        if DateTime.compare(DateTime.utc_now(), export.expires_at) == :gt do
          conn
          |> put_status(:gone)
          |> json(%{error: "This export has expired. Please request a new one."})
        else
          conn
          |> put_resp_content_type("application/gzip")
          |> put_resp_header(
            "content-disposition",
            "attachment; filename=\"inkwell-export-#{user.username}-#{Date.utc_today()}.json.gz\""
          )
          |> send_resp(200, data)
        end

      _ ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "No completed export found."})
    end
  end

  defp render_export(export) do
    %{
      id: export.id,
      status: export.status,
      file_size: export.file_size,
      error_message: export.error_message,
      created_at: export.inserted_at,
      completed_at: export.completed_at,
      expires_at: export.expires_at
    }
  end
end
