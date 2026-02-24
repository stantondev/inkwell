defmodule Inkwell.Import do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Import.DataImport

  @expiry_days 7

  def create_import(attrs) do
    %DataImport{}
    |> DataImport.changeset(attrs)
    |> Repo.insert()
  end

  def get_latest_import(user_id) do
    DataImport
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  def get_import(id, user_id) do
    DataImport
    |> where(id: ^id, user_id: ^user_id)
    |> Repo.one()
  end

  def has_active_import?(user_id) do
    DataImport
    |> where([i], i.user_id == ^user_id and i.status in ["pending", "processing"])
    |> Repo.exists?()
  end

  def mark_processing(%DataImport{} = import_record) do
    import_record
    |> DataImport.changeset(%{status: "processing"})
    |> Repo.update()
  end

  def update_progress(%DataImport{} = import_record, attrs) do
    import_record
    |> DataImport.changeset(attrs)
    |> Repo.update()
  end

  def mark_completed(%DataImport{} = import_record, stats) do
    expires_at = DateTime.add(DateTime.utc_now(), @expiry_days, :day)

    import_record
    |> DataImport.changeset(
      Map.merge(stats, %{
        status: "completed",
        completed_at: DateTime.utc_now(),
        expires_at: expires_at,
        file_data: nil
      })
    )
    |> Repo.update()
  end

  def mark_failed(%DataImport{} = import_record, error_message) do
    import_record
    |> DataImport.changeset(%{
      status: "failed",
      error_message: error_message,
      file_data: nil
    })
    |> Repo.update()
  end

  def cancel_import(%DataImport{} = import_record) do
    if import_record.status in ["pending", "processing"] do
      import_record
      |> DataImport.changeset(%{status: "cancelled", file_data: nil})
      |> Repo.update()
    else
      {:error, :not_cancellable}
    end
  end

  def cleanup_expired_imports do
    now = DateTime.utc_now()

    {expired_count, _} =
      DataImport
      |> where([i], not is_nil(i.expires_at) and i.expires_at < ^now)
      |> Repo.delete_all()

    # Also clean up stuck imports (pending/processing for more than 24 hours)
    stuck_cutoff = DateTime.add(now, -24, :hour)

    {stuck_count, _} =
      DataImport
      |> where([i], i.status in ["pending", "processing"] and i.inserted_at < ^stuck_cutoff)
      |> Repo.delete_all()

    {:ok, expired_count + stuck_count}
  end
end
