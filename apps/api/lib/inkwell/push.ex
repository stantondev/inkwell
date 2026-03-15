defmodule Inkwell.Push do
  @moduledoc """
  Context for web push notification subscriptions and delivery.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Push.PushSubscription

  @pushable_types ~w(
    comment reply mention stamp ink follow_request follow_accepted
    fediverse_follow fediverse_mention letter circle_response circle_mention
    feedback_mention poll_mention writer_plan_subscribe guestbook
  )a

  @doc "Returns true if VAPID keys are configured."
  def configured? do
    config = Application.get_env(:inkwell, :vapid)
    is_list(config) and Keyword.has_key?(config, :public_key)
  end

  @doc "Returns the VAPID public key, or nil."
  def vapid_public_key do
    case Application.get_env(:inkwell, :vapid) do
      config when is_list(config) -> Keyword.get(config, :public_key)
      _ -> nil
    end
  end

  @doc "Upsert a push subscription for a user."
  def subscribe(user_id, attrs) do
    attrs = Map.put(attrs, "user_id", user_id)

    %PushSubscription{}
    |> PushSubscription.changeset(attrs)
    |> Repo.insert(
      on_conflict: {:replace, [:p256dh, :auth, :user_agent, :updated_at]},
      conflict_target: :endpoint,
      returning: true
    )
  end

  @doc "Remove a subscription by user_id + endpoint."
  def unsubscribe(user_id, endpoint) do
    PushSubscription
    |> where([s], s.user_id == ^user_id and s.endpoint == ^endpoint)
    |> Repo.delete_all()

    :ok
  end

  @doc "Delete a subscription by endpoint (for 410 Gone cleanup)."
  def delete_by_endpoint(endpoint) do
    PushSubscription
    |> where([s], s.endpoint == ^endpoint)
    |> Repo.delete_all()

    :ok
  end

  @doc "List all subscriptions for a user."
  def list_subscriptions(user_id) do
    PushSubscription
    |> where([s], s.user_id == ^user_id)
    |> Repo.all()
  end

  @doc "Returns true if the notification type should trigger a push."
  def pushable_type?(type) when is_atom(type), do: type in @pushable_types
  def pushable_type?(type) when is_binary(type), do: String.to_existing_atom(type) in @pushable_types

  @doc """
  Fan-out: enqueue one Oban push job per subscription for a user.
  """
  def deliver(user_id, payload) when is_map(payload) do
    subscriptions = list_subscriptions(user_id)

    Enum.each(subscriptions, fn sub ->
      %{subscription_id: sub.id, payload: payload}
      |> Inkwell.Workers.WebPushWorker.new()
      |> Oban.insert()
    end)

    :ok
  end

  @doc "Build the push notification JSON payload from a notification + actor name."
  def build_payload(notification, actor_name) do
    type = to_string(notification.type)
    {title, body} = build_text(type, actor_name, notification)
    url = build_url(type, notification)

    %{
      title: title,
      body: body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "inkwell-#{type}-#{notification.id}",
      data: %{url: url}
    }
  end

  @doc "Delete subscriptions not updated in 90 days."
  def cleanup_stale_subscriptions do
    cutoff = DateTime.utc_now() |> DateTime.add(-90, :day)

    PushSubscription
    |> where([s], s.updated_at < ^cutoff)
    |> Repo.delete_all()
  end

  # --- Private helpers ---

  defp build_text("comment", actor, _), do: {"New comment", "#{actor} commented on your entry"}
  defp build_text("reply", actor, _), do: {"New reply", "#{actor} replied to your comment"}
  defp build_text("mention", actor, _), do: {"Mentioned", "#{actor} mentioned you in a comment"}
  defp build_text("stamp", actor, _), do: {"New stamp", "#{actor} stamped your entry"}
  defp build_text("ink", actor, _), do: {"New ink", "#{actor} inked your entry"}
  defp build_text("follow_request", actor, _), do: {"Pen pal request", "#{actor} wants to be your pen pal"}
  defp build_text("follow_accepted", actor, _), do: {"Request accepted", "#{actor} accepted your pen pal request"}
  defp build_text("fediverse_follow", actor, _), do: {"New fediverse follower", "#{actor} followed you from the fediverse"}
  defp build_text("fediverse_mention", actor, _), do: {"Mentioned", "#{actor} mentioned you from the fediverse"}
  defp build_text("guestbook", actor, _), do: {"Guestbook signed", "#{actor} signed your guestbook from the fediverse"}
  defp build_text("letter", actor, _), do: {"New letter", "#{actor} sent you a letter"}
  defp build_text("circle_response", actor, n), do: {"Circle response", "#{actor} responded in #{get_circle_name(n)}"}
  defp build_text("circle_mention", actor, n), do: {"Circle mention", "#{actor} mentioned you in #{get_circle_name(n)}"}
  defp build_text("feedback_mention", actor, _), do: {"Mentioned", "#{actor} mentioned you on the roadmap"}
  defp build_text("poll_mention", actor, _), do: {"Mentioned", "#{actor} mentioned you in a poll comment"}
  defp build_text("writer_plan_subscribe", actor, _), do: {"New subscriber", "#{actor} subscribed to your writer plan"}
  defp build_text(_, actor, _), do: {"Inkwell", "#{actor} interacted with your content"}

  defp build_url("letter", _), do: "/letters"
  defp build_url("follow_request", _), do: "/notifications"
  defp build_url("follow_accepted", _), do: "/notifications"
  defp build_url("fediverse_follow", _), do: "/notifications"
  defp build_url("fediverse_mention", _), do: "/notifications"
  defp build_url("guestbook", n), do: "/#{get_in_data(n, "profile_username") || "notifications"}"
  defp build_url("feedback_mention", n), do: "/roadmap/#{get_target_id(n)}"
  defp build_url("poll_mention", n), do: "/polls/#{get_target_id(n)}"

  defp build_url("circle_response", n) do
    slug = get_in_data(n, "circle_slug")
    if slug, do: "/circles/#{slug}", else: "/notifications"
  end

  defp build_url("circle_mention", n) do
    slug = get_in_data(n, "circle_slug")
    if slug, do: "/circles/#{slug}", else: "/notifications"
  end

  defp build_url(_, _), do: "/notifications"

  defp get_circle_name(n) do
    get_in_data(n, "circle_name") || "a circle"
  end

  defp get_target_id(n) do
    n.target_id || ""
  end

  defp get_in_data(n, key) do
    case n.data do
      %{^key => val} -> val
      _ -> nil
    end
  end
end
