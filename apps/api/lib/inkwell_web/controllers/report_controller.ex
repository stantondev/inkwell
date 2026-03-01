defmodule InkwellWeb.ReportController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Moderation}

  # POST /api/entries/:entry_id/report (authenticated)
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    attrs = %{
      reporter_id: user.id,
      entry_id: entry_id,
      reason: params["reason"],
      details: params["details"]
    }

    case Moderation.create_report(attrs) do
      {:ok, _report} ->
        notify_admins_of_report(user, entry_id)
        json(conn, %{ok: true})

      {:error, %Ecto.Changeset{errors: errors}} ->
        if Keyword.has_key?(errors, :reporter_id) do
          conn |> put_status(:conflict) |> json(%{error: "You have already reported this entry"})
        else
          conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(errors)})
        end
    end
  end

  # GET /api/admin/reports (admin)
  def index(conn, params) do
    status = params["status"]
    page = parse_int(params["page"], 1)
    reports = Moderation.list_reports(page: page, status: status)
    pending_count = Moderation.count_pending_reports()

    json(conn, %{
      data: Enum.map(reports, &render_report/1),
      pending_count: pending_count
    })
  end

  # PATCH /api/admin/reports/:id (admin)
  def update(conn, %{"id" => id} = params) do
    admin = conn.assigns.current_user
    report = Moderation.get_report!(id)

    attrs = %{
      status: params["status"],
      admin_notes: params["admin_notes"],
      resolved_by: admin.id
    }

    case Moderation.resolve_report(report, attrs) do
      {:ok, report} ->
        report = Inkwell.Repo.preload(report, [:reporter, entry: :user])
        json(conn, %{data: render_report(report)})

      {:error, _changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update report"})
    end
  rescue
    Ecto.NoResultsError ->
      conn |> put_status(:not_found) |> json(%{error: "Report not found"})
  end

  defp render_report(report) do
    entry = report.entry
    reporter = report.reporter

    %{
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      admin_notes: report.admin_notes,
      resolved_at: report.resolved_at,
      created_at: report.inserted_at,
      reporter: if(reporter, do: %{
        id: reporter.id,
        username: reporter.username,
        display_name: reporter.display_name,
        avatar_url: reporter.avatar_url
      }, else: nil),
      entry: if(entry, do: %{
        id: entry.id,
        title: entry.title,
        slug: entry.slug,
        excerpt: entry.excerpt,
        sensitive: entry.sensitive,
        admin_sensitive: entry.admin_sensitive,
        author: if(entry.user, do: %{
          id: entry.user.id,
          username: entry.user.username,
          display_name: entry.user.display_name
        }, else: nil)
      }, else: nil)
    }
  end

  defp notify_admins_of_report(reporter, entry_id) do
    admins = Accounts.list_admins()

    Enum.each(admins, fn admin ->
      if admin.id != reporter.id do
        Accounts.create_notification(%{
          type: :report,
          user_id: admin.id,
          actor_id: reporter.id,
          target_type: "entry",
          target_id: entry_id,
          data: %{reason: "content_report"}
        })
      end
    end)
  end

  defp format_errors(errors) do
    Enum.map(errors, fn {field, {msg, _}} -> {field, msg} end)
    |> Map.new()
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
end
