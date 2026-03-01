defmodule Inkwell.Moderation do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Moderation.Report

  def create_report(attrs) do
    %Report{}
    |> Report.changeset(attrs)
    |> Repo.insert()
  end

  def list_reports(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    status = Keyword.get(opts, :status)

    query =
      Report
      |> preload([:reporter, entry: :user])
      |> order_by(desc: :inserted_at)

    query = if status, do: where(query, status: ^status), else: query

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def count_pending_reports do
    Report
    |> where(status: "pending")
    |> Repo.aggregate(:count)
  end

  def get_report!(id), do: Repo.get!(Report, id)

  def resolve_report(%Report{} = report, attrs) do
    report
    |> Report.resolve_changeset(Map.merge(attrs, %{resolved_at: DateTime.utc_now()}))
    |> Repo.update()
  end

  def has_reported?(user_id, entry_id) do
    Report
    |> where(reporter_id: ^user_id, entry_id: ^entry_id)
    |> Repo.exists?()
  end
end
