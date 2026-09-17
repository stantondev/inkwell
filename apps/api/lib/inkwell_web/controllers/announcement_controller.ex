defmodule InkwellWeb.AnnouncementController do
  @moduledoc "Admin-only founder announcement emails."
  use InkwellWeb, :controller

  alias Inkwell.Announcements

  require Logger

  # GET /api/admin/announcement — recipient count + preview HTML
  def show(conn, params) do
    body = params["body"] || ""

    json(conn, %{
      recipient_count: Announcements.recipient_count(),
      preview_html: Inkwell.Email.announcement_html(body, "#unsubscribe")
    })
  end

  # POST /api/admin/announcement/test — send only to the signed-in admin
  def test(conn, %{"subject" => subject, "body" => body}) do
    admin = conn.assigns.current_user

    case Announcements.send_test(admin, subject, body) do
      {:error, msg} when is_binary(msg) ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: msg})

      {:error, reason} ->
        Logger.error("[Announcement] test send failed: #{inspect(reason)}")
        conn |> put_status(:bad_gateway) |> json(%{error: "Email provider rejected the test send."})

      {:ok, :no_email_configured} ->
        json(conn, %{ok: true, sent_to: admin.email, note: "Email isn't configured here, so nothing was actually sent."})

      _ ->
        json(conn, %{ok: true, sent_to: admin.email})
    end
  end

  def test(conn, _), do: conn |> put_status(:bad_request) |> json(%{error: "Subject and message are required"})

  # POST /api/admin/announcement/send — queue for everyone.
  # `confirm_count` must equal the current recipient count, so a stray request
  # (or a stale page) can't email the whole community.
  def send_all(conn, %{"subject" => subject, "body" => body, "confirm_count" => confirm}) do
    expected = Announcements.recipient_count()

    if confirm != expected do
      conn
      |> put_status(:conflict)
      |> json(%{error: "Recipient count changed or wasn't confirmed. Expected #{expected}.", recipient_count: expected})
    else
      case Announcements.enqueue_all(subject, body) do
        {:ok, queued} ->
          Logger.info("[Announcement] @#{conn.assigns.current_user.username} queued \"#{subject}\" to #{queued} users")
          Inkwell.Slack.notify(":mega: Announcement \"#{subject}\" queued to #{queued} people")
          json(conn, %{ok: true, queued: queued})

        {:error, msg} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: msg})
      end
    end
  end

  def send_all(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "Subject, message and confirm_count are required"})
end
