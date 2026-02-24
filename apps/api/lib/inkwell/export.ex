defmodule Inkwell.Export do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Export.DataExport

  @expiry_hours 48

  def create_export(user_id) do
    %DataExport{}
    |> DataExport.changeset(%{user_id: user_id, status: "pending"})
    |> Repo.insert()
  end

  def get_latest_export(user_id) do
    DataExport
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  def get_export(id, user_id) do
    DataExport
    |> where(id: ^id, user_id: ^user_id)
    |> Repo.one()
  end

  def has_active_export?(user_id) do
    DataExport
    |> where([e], e.user_id == ^user_id and e.status in ["pending", "processing"])
    |> Repo.exists?()
  end

  def mark_processing(%DataExport{} = export) do
    export
    |> DataExport.changeset(%{status: "processing"})
    |> Repo.update()
  end

  def mark_completed(%DataExport{} = export, compressed_data, file_size) do
    expires_at = DateTime.add(DateTime.utc_now(), @expiry_hours, :hour)

    export
    |> DataExport.changeset(%{
      status: "completed",
      data: compressed_data,
      file_size: file_size,
      completed_at: DateTime.utc_now(),
      expires_at: expires_at
    })
    |> Repo.update()
  end

  def mark_failed(%DataExport{} = export, error_message) do
    export
    |> DataExport.changeset(%{status: "failed", error_message: error_message})
    |> Repo.update()
  end

  def cleanup_expired_exports do
    now = DateTime.utc_now()

    {expired_count, _} =
      DataExport
      |> where([e], not is_nil(e.expires_at) and e.expires_at < ^now)
      |> Repo.delete_all()

    # Also clean up stuck exports (pending/processing for more than 24 hours)
    stuck_cutoff = DateTime.add(now, -24, :hour)

    {stuck_count, _} =
      DataExport
      |> where([e], e.status in ["pending", "processing"] and e.inserted_at < ^stuck_cutoff)
      |> Repo.delete_all()

    {:ok, expired_count + stuck_count}
  end
end
