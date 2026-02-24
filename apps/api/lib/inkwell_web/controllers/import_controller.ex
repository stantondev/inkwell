defmodule InkwellWeb.ImportController do
  use InkwellWeb, :controller

  alias Inkwell.Import

  @max_file_size 52_428_800
  @valid_formats ~w(inkwell_json generic_csv generic_json wordpress_wxr medium_html substack_csv)

  @doc "POST /api/me/import — upload file and start import"
  def create(conn, params) do
    user = conn.assigns.current_user

    if Import.has_active_import?(user.id) do
      conn
      |> put_status(:conflict)
      |> json(%{error: "An import is already in progress. Please wait for it to complete."})
    else
      with {:ok, format} <- validate_format(params["format"]),
           {:ok, import_mode} <- validate_import_mode(params["import_mode"]),
           {:ok, default_privacy} <- validate_privacy(params["default_privacy"]),
           {:ok, file_data, file_name, file_size} <- read_upload(params) do
        if file_size > @max_file_size do
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "File too large — maximum 50MB."})
        else
          attrs = %{
            user_id: user.id,
            format: format,
            import_mode: import_mode,
            default_privacy: default_privacy,
            file_data: file_data,
            file_name: file_name,
            file_size: file_size,
            status: "pending"
          }

          case Import.create_import(attrs) do
            {:ok, import_record} ->
              %{import_id: import_record.id, user_id: user.id}
              |> Inkwell.Workers.ImportDataWorker.new()
              |> Oban.insert()

              conn
              |> put_status(:created)
              |> json(%{data: render_import(import_record)})

            {:error, _changeset} ->
              conn
              |> put_status(:internal_server_error)
              |> json(%{error: "Failed to create import."})
          end
        end
      else
        {:error, message} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: message})
      end
    end
  end

  @doc "GET /api/me/import — get latest import status"
  def status(conn, _params) do
    user = conn.assigns.current_user

    case Import.get_latest_import(user.id) do
      nil -> json(conn, %{data: nil})
      import_record -> json(conn, %{data: render_import(import_record)})
    end
  end

  @doc "POST /api/me/import/cancel — cancel active import"
  def cancel(conn, _params) do
    user = conn.assigns.current_user

    case Import.get_latest_import(user.id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "No import found."})

      import_record ->
        case Import.cancel_import(import_record) do
          {:ok, updated} ->
            json(conn, %{data: render_import(updated)})

          {:error, :not_cancellable} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "Import cannot be cancelled in its current state."})
        end
    end
  end

  # ── Helpers ──

  defp read_upload(%{"file" => %Plug.Upload{} = upload}) do
    case File.read(upload.path) do
      {:ok, data} -> {:ok, data, upload.filename, byte_size(data)}
      {:error, _} -> {:error, "Failed to read uploaded file."}
    end
  end

  defp read_upload(_), do: {:error, "No file provided. Upload a file using multipart/form-data."}

  defp validate_format(format) when format in @valid_formats, do: {:ok, format}
  defp validate_format(_), do: {:error, "Invalid format. Must be one of: #{Enum.join(@valid_formats, ", ")}"}

  defp validate_import_mode(mode) when mode in ~w(draft published), do: {:ok, mode}
  defp validate_import_mode(nil), do: {:ok, "draft"}
  defp validate_import_mode(_), do: {:error, "Invalid import mode. Must be 'draft' or 'published'."}

  defp validate_privacy(p) when p in ~w(public friends_only private), do: {:ok, p}
  defp validate_privacy(nil), do: {:ok, "private"}
  defp validate_privacy(_), do: {:error, "Invalid privacy. Must be 'public', 'friends_only', or 'private'."}

  defp render_import(import_record) do
    %{
      id: import_record.id,
      status: import_record.status,
      format: import_record.format,
      import_mode: import_record.import_mode,
      default_privacy: import_record.default_privacy,
      file_name: import_record.file_name,
      file_size: import_record.file_size,
      total_entries: import_record.total_entries,
      imported_count: import_record.imported_count,
      skipped_count: import_record.skipped_count,
      error_count: import_record.error_count,
      errors: import_record.errors,
      error_message: import_record.error_message,
      created_at: import_record.inserted_at,
      completed_at: import_record.completed_at
    }
  end
end
