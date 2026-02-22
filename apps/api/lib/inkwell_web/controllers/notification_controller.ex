defmodule InkwellWeb.NotificationController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals}

  # GET /api/notifications
  def index(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)

    notifications = Accounts.list_notifications(user.id, page: page, per_page: 20)

    # Batch load entries referenced by notifications (for stamp, comment, like)
    entry_ids =
      notifications
      |> Enum.filter(fn n -> n.target_type == "entry" && n.target_id != nil end)
      |> Enum.map(& &1.target_id)
      |> Enum.uniq()

    entries_map =
      entry_ids
      |> Journals.get_entries_by_ids()
      |> Map.new(fn entry -> {entry.id, entry} end)

    json(conn, %{data: Enum.map(notifications, fn n -> render_notification(n, entries_map) end)})
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

  defp render_notification(n, entries_map) do
    # For federated notifications, remote actor info lives in the `data` field
    remote_actor =
      case n.data do
        %{"remote_actor" => ra} when is_map(ra) ->
          %{
            username: ra["username"],
            domain: ra["domain"],
            display_name: ra["display_name"],
            avatar_url: ra["avatar_url"],
            profile_url: ra["profile_url"],
            ap_id: ra["ap_id"]
          }
        _ -> nil
      end

    # Include entry info when the notification targets an entry
    entry =
      if n.target_type == "entry" && n.target_id do
        case Map.get(entries_map, n.target_id) do
          nil -> nil
          e ->
            %{
              slug: e.slug,
              title: e.title,
              user: %{username: e.user.username}
            }
        end
      else
        nil
      end

    %{
      id: n.id,
      type: n.type,
      actor_id: n.actor_id,
      actor: render_actor(n.actor),
      remote_actor: remote_actor,
      target_type: n.target_type,
      target_id: n.target_id,
      read: n.read,
      data: render_data(n.data),
      entry: entry,
      inserted_at: n.inserted_at
    }
  end

  defp render_actor(nil), do: nil
  defp render_actor(actor) do
    %{
      username: actor.username,
      display_name: actor.display_name,
      avatar_url: actor.avatar_url
    }
  end

  defp render_data(nil), do: %{}
  defp render_data(data) when is_map(data), do: data
  defp render_data(_), do: %{}

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
