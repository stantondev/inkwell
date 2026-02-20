defmodule InkwellWeb.NotificationController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts

  # GET /api/notifications
  def index(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)

    notifications = Accounts.list_notifications(user.id, page: page, per_page: 20)
    json(conn, %{data: Enum.map(notifications, &render_notification/1)})
  end

  # POST /api/notifications/read
  # Body: { "ids": ["uuid1", "uuid2"] } or {} to mark all
  def mark_read(conn, params) do
    user = conn.assigns.current_user

    ids = Map.get(params, "ids", :all)

    notification_ids =
      if ids == :all do
        Accounts.list_notifications(user.id, per_page: 200) |> Enum.map(& &1.id)
      else
        ids
      end

    Accounts.mark_notifications_read(user.id, notification_ids)
    json(conn, %{ok: true})
  end

  defp render_notification(n) do
    %{
      id: n.id,
      type: n.type,
      actor_id: n.actor_id,
      target_type: n.target_type,
      target_id: n.target_id,
      read: n.read,
      created_at: n.inserted_at
    }
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
