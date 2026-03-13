defmodule InkwellWeb.NotificationController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Repo}

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

    # Batch check if user is already following back fediverse followers
    follow_back_set = build_follow_back_set(user.id, notifications)

    json(conn, %{data: Enum.map(notifications, fn n -> render_notification(n, entries_map, follow_back_set) end)})
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

  # Build a MapSet of remote_actor ap_ids that the user is already following back
  defp build_follow_back_set(user_id, notifications) do
    import Ecto.Query

    remote_actor_ap_ids =
      notifications
      |> Enum.filter(fn n -> n.type == :fediverse_follow end)
      |> Enum.map(fn n -> get_in(n.data, ["remote_actor", "ap_id"]) end)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    if remote_actor_ap_ids == [] do
      MapSet.new()
    else
      # Find remote_actor IDs by ap_id
      actor_rows =
        Inkwell.Federation.RemoteActor
        |> where([a], a.ap_id in ^remote_actor_ap_ids)
        |> select([a], {a.id, a.ap_id})
        |> Repo.all()

      actor_id_to_ap_id = Map.new(actor_rows, fn {id, ap_id} -> {id, ap_id} end)
      actor_ids = Enum.map(actor_rows, fn {id, _} -> id end)

      # Check which ones the user has an outbound relationship to
      following_actor_ids =
        Inkwell.Social.Relationship
        |> where([r], r.follower_id == ^user_id and r.remote_actor_id in ^actor_ids)
        |> where([r], r.status in [:pending, :accepted])
        |> select([r], r.remote_actor_id)
        |> Repo.all()

      following_actor_ids
      |> Enum.map(fn id -> Map.get(actor_id_to_ap_id, id) end)
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()
    end
  end

  defp render_notification(n, entries_map, follow_back_set) do
    # For federated notifications, remote actor info lives in the `data` field
    remote_actor =
      case n.data do
        %{"remote_actor" => ra} when is_map(ra) ->
          ap_id = ra["ap_id"]
          %{
            username: ra["username"],
            domain: ra["domain"],
            display_name: ra["display_name"],
            avatar_url: ra["avatar_url"],
            profile_url: ra["profile_url"],
            ap_id: ap_id,
            is_following_back: MapSet.member?(follow_back_set, ap_id)
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
