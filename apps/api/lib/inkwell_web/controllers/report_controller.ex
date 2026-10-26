defmodule InkwellWeb.ReportController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Moderation}

  # POST /api/entries/:entry_id/report (authenticated)
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    attrs = %{
      reporter_id: user.id,
      entry_id: entry_id,
      reported_user_id: entry_author_id(entry_id),
      reason: params["reason"],
      details: params["details"]
    }

    case Moderation.create_report(attrs) do
      {:ok, report} ->
        notify_admins(user, "entry", entry_id, "content_report")
        Inkwell.Moderation.AutoModeration.handle_new_report(report, user)
        json(conn, %{ok: true})

      {:error, %Ecto.Changeset{errors: errors}} ->
        if Keyword.has_key?(errors, :reporter_id) do
          conn |> put_status(:conflict) |> json(%{error: "You have already reported this entry"})
        else
          conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(errors)})
        end
    end
  end

  # POST /api/users/:username/report (authenticated): a report about an
  # account as a whole — a spammy bio, unwanted requests or letters,
  # impersonation. Goes to the same admin queue and counts toward the spam
  # checker like entry reports do.
  def create_account(conn, %{"username" => username} = params) do
    user = conn.assigns.current_user

    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      %{id: id} when id == user.id ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "You can't report yourself"})

      target ->
        attrs = %{
          reporter_id: user.id,
          reported_user_id: target.id,
          reason: params["reason"],
          details: params["details"]
        }

        case Moderation.create_account_report(attrs) do
          {:ok, report} ->
            notify_admins(user, "user", target.id, "account_report")
            Inkwell.Moderation.AutoModeration.handle_new_report(report, user)
            json(conn, %{ok: true})

          {:error, %Ecto.Changeset{errors: errors}} ->
            if Keyword.has_key?(errors, :reporter_id) do
              conn |> put_status(:conflict) |> json(%{error: "You have already reported this account"})
            else
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(errors)})
            end
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
        report = Inkwell.Repo.preload(report, [:reporter, :reported_user, entry: :user])
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
    reported = report.reported_user

    %{
      id: report.id,
      kind: if(is_nil(report.entry_id), do: "account", else: "entry"),
      reported_user: if(reported, do: %{
        id: reported.id,
        username: reported.username,
        display_name: reported.display_name,
        bio: reported.bio,
        blocked: reported.blocked_at != nil,
        moderation_state: reported.moderation_state
      }, else: nil),
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
        avatar_url: Inkwell.Avatars.avatar_url(reporter)
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

  defp notify_admins(reporter, target_type, target_id, reason) do
    admins = Accounts.list_admins()

    Enum.each(admins, fn admin ->
      if admin.id != reporter.id do
        Accounts.create_notification(%{
          type: :report,
          user_id: admin.id,
          actor_id: reporter.id,
          target_type: target_type,
          target_id: target_id,
          data: %{reason: reason}
        })
      end
    end)
  end

  defp entry_author_id(entry_id) do
    with {:ok, uuid} <- Ecto.UUID.cast(entry_id),
         %{user_id: user_id} <- Inkwell.Repo.get(Inkwell.Journals.Entry, uuid) do
      user_id
    else
      _ -> nil
    end
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
