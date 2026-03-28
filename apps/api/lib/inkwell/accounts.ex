defmodule Inkwell.Accounts do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts.{User, UserIcon, Notification}

  def get_user!(id), do: Repo.get!(User, id)

  def get_user_by_username(username) do
    Repo.get_by(User, username: username)
  end

  def get_user_by_email(email) do
    Repo.get_by(User, email: email)
  end

  def increment_visitor_count(user_id) do
    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(inc: [visitor_count: 1])
  end

  # Inactivity thresholds (days)
  @inactive_with_posts_days 30
  @inactive_no_posts_days 14

  def touch_last_active(user_id) do
    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(set: [last_active_at: DateTime.utc_now()])
  end

  @doc "Returns a WHERE clause that filters out inactive users via subquery."
  def active_user_ids_subquery do
    now = DateTime.utc_now()
    cutoff_with_posts = DateTime.add(now, -@inactive_with_posts_days, :day)
    cutoff_no_posts = DateTime.add(now, -@inactive_no_posts_days, :day)

    has_posts_ids =
      from(e in Inkwell.Journals.Entry,
        where: e.status == :published,
        select: e.user_id,
        distinct: true
      )

    from(u in User,
      where:
        is_nil(u.last_active_at) or
        (u.id in subquery(has_posts_ids) and u.last_active_at >= ^cutoff_with_posts) or
        (u.id not in subquery(has_posts_ids) and u.last_active_at >= ^cutoff_no_posts),
      select: u.id
    )
  end

  def inactive_cutoff_date do
    DateTime.add(DateTime.utc_now(), -@inactive_no_posts_days, :day)
  end

  @doc "Check if a specific user is inactive (two-tier threshold)."
  def user_inactive?(user) do
    case user.last_active_at do
      nil -> true
      last_active ->
        has_posts = Repo.exists?(
          from(e in Inkwell.Journals.Entry,
            where: e.user_id == ^user.id and e.status == :published)
        )
        cutoff_days = if has_posts, do: @inactive_with_posts_days, else: @inactive_no_posts_days
        DateTime.diff(DateTime.utc_now(), last_active, :day) >= cutoff_days
    end
  end

  def create_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end

  def set_terms_accepted(%User{} = user) do
    user
    |> Ecto.Changeset.change(%{terms_accepted_at: DateTime.utc_now()})
    |> Repo.update()
  end

  def update_user_profile(%User{} = user, attrs) do
    user
    |> User.profile_changeset(attrs)
    |> Repo.update()
    |> tap_ok(&enqueue_search_index_user/1)
  end

  def update_username(%User{} = user, attrs) do
    user
    |> User.username_changeset(attrs)
    |> Repo.update()
    |> tap_ok(fn updated ->
      enqueue_search_index_user(updated)
      # Re-index all user's entries (author_username changed)
      enqueue_search_reindex_user_entries(updated.id)
    end)
  end

  def username_available?(username) do
    not User.reserved_username?(username) and
      not Repo.exists?(from u in User, where: u.username == ^username)
  end

  @doc "Search users by username prefix for @mention autocomplete. Returns up to `limit` users."
  def search_users_by_prefix(prefix, limit \\ 10, exclude_ids \\ []) do
    prefix = String.trim(prefix) |> String.downcase()

    if String.length(prefix) < 1 do
      []
    else
      like_pattern = "#{prefix}%"

      # Use the longer threshold (30 days) for mention autocomplete to be conservative
      activity_cutoff = DateTime.add(DateTime.utc_now(), -@inactive_with_posts_days, :day)

      query =
        User
        |> where([u], like(u.username, ^like_pattern))
        |> where([u], not is_nil(u.username))
        |> where([u], is_nil(u.blocked_at))
        |> where([u], u.last_active_at >= ^activity_cutoff or is_nil(u.last_active_at))
        |> order_by([u], asc: u.username)
        |> limit(^limit)
        |> select([u], %{id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url})

      query =
        if exclude_ids != [] do
          where(query, [u], u.id not in ^exclude_ids)
        else
          query
        end

      Repo.all(query)
    end
  end

  # Returns recently active public writers, excluding current user and anyone already followed/pending.
  # Sorted by entry count + total ink count (quality proxy). Requires min 3 published entries.
  def list_suggested_users(current_user_id, limit \\ 12) do
    already_following =
      from r in Inkwell.Social.Relationship,
        where: r.follower_id == ^current_user_id and r.status in [:pending, :accepted],
        select: r.following_id

    blocked_ids = Inkwell.Social.get_blocked_user_ids(current_user_id)

    # Primary: users with ≥3 published public entries, sorted by entry count + ink count
    active_cutoff = DateTime.add(DateTime.utc_now(), -@inactive_with_posts_days, :day)

    writers =
      from u in User,
        join: e in Inkwell.Journals.Entry, on: e.user_id == u.id,
        where: e.status == :published and e.privacy == :public,
        where: u.id != ^current_user_id,
        where: u.id not in subquery(already_following),
        where: u.id not in ^blocked_ids,
        where: is_nil(u.blocked_at),
        where: u.last_active_at >= ^active_cutoff or is_nil(u.last_active_at),
        group_by: u.id,
        having: count(e.id) >= 3,
        order_by: [desc: count(e.id) + sum(coalesce(e.ink_count, 0))],
        limit: ^limit,
        select: %{user: u, entry_count: count(e.id), total_ink_count: sum(coalesce(e.ink_count, 0))}

    results = Repo.all(writers)

    # Fallback: if not enough, relax to ≥1 entry
    results =
      if length(results) < limit do
        existing_ids = Enum.map(results, & &1.user.id)
        remaining = limit - length(results)

        fallback =
          from u in User,
            join: e in Inkwell.Journals.Entry, on: e.user_id == u.id,
            where: e.status == :published and e.privacy == :public,
            where: u.id != ^current_user_id,
            where: u.id not in ^existing_ids,
            where: u.id not in subquery(already_following),
            where: u.id not in ^blocked_ids,
            where: is_nil(u.blocked_at),
            where: u.last_active_at >= ^active_cutoff or is_nil(u.last_active_at),
            group_by: u.id,
            order_by: [desc: count(e.id)],
            limit: ^remaining,
            select: %{user: u, entry_count: count(e.id), total_ink_count: sum(coalesce(e.ink_count, 0))}

        results ++ Repo.all(fallback)
      else
        results
      end

    # Final fallback: pad with recently joined users (no entries yet)
    no_posts_cutoff = DateTime.add(DateTime.utc_now(), -@inactive_no_posts_days, :day)

    if length(results) < limit do
      existing_ids = Enum.map(results, & &1.user.id)
      remaining = limit - length(results)

      fallback =
        from u in User,
          where: u.id != ^current_user_id,
          where: u.id not in ^existing_ids,
          where: u.id not in subquery(already_following),
          where: u.id not in ^blocked_ids,
          where: is_nil(u.blocked_at),
          where: not is_nil(u.username),
          where: u.last_active_at >= ^no_posts_cutoff or is_nil(u.last_active_at),
          order_by: [desc: u.inserted_at],
          limit: ^remaining,
          select: u

      results ++ Enum.map(Repo.all(fallback), fn u -> %{user: u, entry_count: 0, total_ink_count: 0} end)
    else
      results
    end
  end

  # Post by Email

  @doc "Enable post by email — generates a unique token."
  def enable_post_by_email(%User{} = user) do
    token = generate_post_email_token()

    user
    |> Ecto.Changeset.change(%{post_email_token: token})
    |> Repo.update()
  end

  @doc "Disable post by email — clears the token."
  def disable_post_by_email(%User{} = user) do
    user
    |> Ecto.Changeset.change(%{post_email_token: nil})
    |> Repo.update()
  end

  @doc "Regenerate the post email token (invalidates old address)."
  def regenerate_post_email_token(%User{} = user) do
    token = generate_post_email_token()

    user
    |> Ecto.Changeset.change(%{post_email_token: token})
    |> Repo.update()
  end

  @doc "Look up a user by their post email token."
  def get_user_by_post_email_token(token) when is_binary(token) do
    Repo.get_by(User, post_email_token: token)
  end
  def get_user_by_post_email_token(_), do: nil

  defp generate_post_email_token do
    :crypto.strong_rand_bytes(9) |> Base.url_encode64(padding: false)
  end

  # User Icons

  def list_user_icons(user_id) do
    UserIcon
    |> where(user_id: ^user_id)
    |> order_by(:sort_order)
    |> Repo.all()
  end

  def create_user_icon(attrs) do
    %UserIcon{}
    |> UserIcon.changeset(attrs)
    |> Repo.insert()
  end

  def delete_user_icon(%UserIcon{} = icon) do
    Repo.delete(icon)
  end

  # Notifications

  def list_notifications(user_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    Notification
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload(:actor)
    |> Repo.all()
  end

  @doc """
  Check if a notification with the same user/type/actor/target was created recently.
  Used to prevent duplicate notifications from rapid-fire requests or federation echoes.
  """
  def recent_notification_exists?(user_id, type, actor_id, target_id) do
    since = DateTime.utc_now() |> DateTime.add(-300, :second)

    query =
      Notification
      |> where(user_id: ^user_id, type: ^type, target_id: ^target_id)
      |> where([n], n.inserted_at >= ^since)

    query =
      if actor_id do
        where(query, actor_id: ^actor_id)
      else
        where(query, [n], is_nil(n.actor_id))
      end

    Repo.exists?(query)
  end

  def create_notification(attrs) do
    user_id = attrs[:user_id] || attrs["user_id"]
    actor_id = attrs[:actor_id] || attrs["actor_id"]

    # Skip notification if block exists between these users
    if actor_id && Inkwell.Social.is_blocked_between?(user_id, actor_id) do
      {:ok, :blocked_skipped}
    else
      result =
        %Notification{}
        |> Notification.changeset(attrs)
        |> Repo.insert()

      case result do
        {:ok, notification} ->
          maybe_send_push(notification, attrs)
          maybe_send_email_notification(notification, attrs)
          {:ok, notification}

        error ->
          error
      end
    end
  end

  defp maybe_send_push(notification, _attrs) do
    alias Inkwell.Push

    if Push.configured?() and Push.pushable_type?(notification.type) do
      user = Repo.get(Inkwell.Accounts.User, notification.user_id)

      push_disabled =
        case user do
          %{settings: %{"push_notifications_disabled" => true}} -> true
          _ -> false
        end

      unless push_disabled do
        actor_name = resolve_push_actor_name(notification)
        payload = Push.build_payload(notification, actor_name)
        Push.deliver(notification.user_id, payload)
      end
    end
  rescue
    e ->
      require Logger
      Logger.warning("[Push] Failed to send push: #{inspect(e)}")
  end

  @emailable_types ~w(comment reply mention feedback_mention poll_mention circle_mention)a

  defp maybe_send_email_notification(notification, _attrs) do
    if notification.type in @emailable_types do
      user = Repo.get(Inkwell.Accounts.User, notification.user_id)

      email_disabled =
        case user do
          %{settings: %{"email_notifications_disabled" => true}} -> true
          _ -> false
        end

      unless email_disabled or is_nil(user) or is_nil(user.email) do
        actor_name = resolve_push_actor_name(notification)
        actor_username = resolve_actor_username(notification)
        {entry_title, entry_url} = resolve_entry_info(notification)
        comment_id = get_in(notification.data || %{}, ["comment_id"]) ||
                     get_in(notification.data || %{}, [:comment_id])

        %{
          user_id: notification.user_id,
          actor_name: actor_name,
          actor_username: actor_username,
          type: to_string(notification.type),
          entry_title: entry_title,
          entry_url: entry_url,
          comment_id: if(comment_id, do: to_string(comment_id), else: nil)
        }
        |> Inkwell.Workers.EmailNotificationWorker.new()
        |> Oban.insert()
      end
    end
  rescue
    e ->
      require Logger
      Logger.warning("[EmailNotification] Failed to enqueue: #{inspect(e)}")
  end

  defp resolve_entry_info(notification) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

    # For non-entry mention types, build context-appropriate titles and URLs
    case notification.type do
      :feedback_mention ->
        {"a roadmap discussion", "#{frontend_url}/roadmap/#{notification.target_id}"}

      :poll_mention ->
        {"a poll comment", "#{frontend_url}/polls/#{notification.target_id}"}

      :circle_mention ->
        circle_slug = get_in(notification.data || %{}, ["circle_slug"])
        circle_name = get_in(notification.data || %{}, ["circle_name"]) || "a circle"
        url = if circle_slug, do: "#{frontend_url}/circles/#{circle_slug}", else: "#{frontend_url}/notifications"
        {circle_name, url}

      _ ->
        resolve_entry_info_for_entry(notification, frontend_url)
    end
  end

  defp resolve_entry_info_for_entry(notification, frontend_url) do
    case notification.target_id do
      nil ->
        {"an entry", "#{frontend_url}/notifications"}

      target_id ->
        case Repo.get(Inkwell.Journals.Entry, target_id) do
          nil ->
            # target_id might be a comment ID — check notification data for entry info
            entry_slug = get_in(notification.data || %{}, ["entry_slug"])
            entry_username = get_in(notification.data || %{}, ["entry_username"])

            if entry_slug && entry_username do
              {get_in(notification.data, ["entry_title"]) || "an entry",
               "#{frontend_url}/#{entry_username}/#{entry_slug}"}
            else
              {"an entry", "#{frontend_url}/notifications"}
            end

          entry ->
            username =
              case Repo.get(Inkwell.Accounts.User, entry.user_id) do
                nil -> "unknown"
                u -> u.username
              end

            {entry.title || "an entry", "#{frontend_url}/#{username}/#{entry.slug}"}
        end
    end
  end

  defp resolve_push_actor_name(notification) do
    cond do
      notification.actor_id == nil and is_map(notification.data) ->
        get_in(notification.data, ["remote_actor", "display_name"]) ||
          get_in(notification.data, ["remote_actor", "username"]) ||
          "Someone"

      notification.actor_id != nil ->
        case Repo.get(Inkwell.Accounts.User, notification.actor_id) do
          nil -> "Someone"
          user -> user.display_name || user.username || "Someone"
        end

      true ->
        "Someone"
    end
  end

  defp resolve_actor_username(notification) do
    cond do
      notification.actor_id == nil and is_map(notification.data) ->
        username = get_in(notification.data, ["remote_actor", "username"])
        domain = get_in(notification.data, ["remote_actor", "domain"])
        if username && domain, do: "#{username}@#{domain}", else: username

      notification.actor_id != nil ->
        case Repo.get(Inkwell.Accounts.User, notification.actor_id) do
          nil -> nil
          user -> user.username
        end

      true ->
        nil
    end
  end

  def mark_notifications_read(user_id, notification_ids) do
    Notification
    |> where([n], n.user_id == ^user_id and n.id in ^notification_ids)
    |> Repo.update_all(set: [read: true])
  end

  @doc """
  Mark all follow_request notifications from a given actor as read.
  Called when accepting or rejecting a follow request so the notification
  doesn't reappear with action buttons after page refresh.
  """
  def mark_follow_request_notifications_read(user_id, actor_id) do
    Notification
    |> where([n], n.user_id == ^user_id and n.actor_id == ^actor_id and n.type == :follow_request)
    |> Repo.update_all(set: [read: true])
  end

  @doc """
  Delete follow_request notifications for a specific user+actor pair.
  Called when a follow request is cancelled (unfollowed) so the notification
  disappears entirely instead of showing stale Accept/Decline buttons.
  """
  def delete_follow_request_notifications(user_id, actor_id) do
    Notification
    |> where([n], n.user_id == ^user_id and n.actor_id == ^actor_id and n.type == :follow_request)
    |> Repo.delete_all()
  end

  def count_unread_notifications(user_id) do
    Notification
    |> where(user_id: ^user_id, read: false)
    |> Repo.aggregate(:count, :id)
  end

  @doc "Delete read notifications older than `days` days."
  def cleanup_read_notifications(days \\ 90) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      Notification
      |> where([n], n.read == true and n.inserted_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  # Account deletion

  def delete_account(%User{} = user) do
    # Cancel Stripe Plus subscription if active
    if user.stripe_subscription_id do
      Inkwell.Billing.cancel_subscription(user.stripe_subscription_id)
    end

    # Cancel Stripe Ink Donor subscription if active
    if user.ink_donor_stripe_subscription_id do
      Inkwell.Billing.cancel_donor_subscription(user.ink_donor_stripe_subscription_id)
    end

    # Cancel writer plan subscriptions (both as writer and subscriber)
    Inkwell.WriterSubscriptions.cancel_all_for_writer(user.id)
    Inkwell.WriterSubscriptions.cancel_all_for_subscriber(user.id)

    # Clean up Fly certificate for custom domain (if any) before DB cascade
    if domain = Inkwell.CustomDomains.get_domain_by_user(user.id) do
      if domain.status in ["active", "pending_cert"] do
        Inkwell.Workers.CustomDomainCertWorker.new(%{
          "action" => "delete",
          "hostname" => domain.domain
        })
        |> Oban.insert()
      end
    end

    # Remove from Meilisearch before DB cascade deletes the entries
    enqueue_search_delete_user(user.id)
    enqueue_search_delete_user_entries(user.id)

    # DB cascading foreign keys handle all associated data
    Repo.delete(user)
  end

  # Admin

  def is_admin?(%User{username: username, role: role}) do
    admin_usernames = Application.get_env(:inkwell, :admin_usernames, [])
    role == "admin" || username in admin_usernames
  end
  def is_admin?(_), do: false

  @doc "List all admin users (both DB-role and env-var admins)."
  def list_admins do
    admin_usernames = Application.get_env(:inkwell, :admin_usernames, [])

    User
    |> where([u], u.role == "admin" or u.username in ^admin_usernames)
    |> where([u], is_nil(u.blocked_at))
    |> Repo.all()
  end

  @doc "Check if user is an env-var admin (cannot be demoted via UI)."
  def is_env_admin?(%User{username: username}) do
    admin_usernames = Application.get_env(:inkwell, :admin_usernames, [])
    username in admin_usernames
  end
  def is_env_admin?(_), do: false

  @doc "List all users with pagination, search, and filters."
  def list_users(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 50)
    search = Keyword.get(opts, :search)
    filter = Keyword.get(opts, :filter)

    query =
      User
      |> order_by(desc: :inserted_at)

    query = if search && search != "" do
      term = "%#{search}%"
      where(query, [u], ilike(u.username, ^term) or ilike(u.email, ^term) or ilike(u.display_name, ^term))
    else
      query
    end

    query = case filter do
      "admin" -> where(query, [u], u.role == "admin")
      "plus" -> where(query, [u], u.subscription_tier == "plus")
      "donor" -> where(query, [u], u.ink_donor_status == "active")
      "blocked" -> where(query, [u], not is_nil(u.blocked_at))
      "inactive" -> where(query, [u], u.id not in subquery(active_user_ids_subquery()))
      "active" -> where(query, [u], u.id in subquery(active_user_ids_subquery()))
      _ -> query
    end

    total = Repo.aggregate(query, :count, :id)

    users =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    # Tag env-var admins so the controller can mark them
    env_admins = Application.get_env(:inkwell, :admin_usernames, [])
    users = Enum.map(users, fn u ->
      Map.put(u, :is_env_admin, u.username in env_admins)
    end)

    {users, total}
  end

  @doc "Get a single user by ID for admin view."
  def get_user_admin(id) do
    Repo.get(User, id)
  end

  @doc "Set user role (admin/user)."
  def set_role(%User{} = user, role) when role in ["admin", "user"] do
    user
    |> Ecto.Changeset.change(%{role: role})
    |> Repo.update()
  end

  @doc "Admin-rename a user. Uses username_changeset for full validation."
  def admin_rename_user(%User{} = user, new_username) do
    user
    |> User.username_changeset(%{username: new_username})
    |> Repo.update()
    |> case do
      {:ok, user} ->
        # Reindex search with new username
        if Code.ensure_loaded?(Inkwell.Search) and function_exported?(Inkwell.Search, :configured?, 0) and Inkwell.Search.configured?() do
          Inkwell.Workers.SearchIndexWorker.new(%{"action" => "index_user", "user_id" => user.id})
          |> Oban.insert()
        end
        {:ok, user}

      error ->
        error
    end
  end

  @doc "Block a user and revoke all their auth tokens."
  def block_user(%User{} = user) do
    user
    |> Ecto.Changeset.change(%{blocked_at: DateTime.utc_now()})
    |> Repo.update()
    |> case do
      {:ok, user} ->
        # Revoke all auth tokens and API keys to force sign out
        Inkwell.Auth.revoke_all_user_tokens(user.id)
        Inkwell.ApiKeys.revoke_all_user_keys(user.id)
        # Remove from search
        enqueue_search_delete_user(user.id)
        {:ok, user}
      error -> error
    end
  end

  @doc "Unblock a user."
  def unblock_user(%User{} = user) do
    user
    |> Ecto.Changeset.change(%{blocked_at: nil})
    |> Repo.update()
  end

  @doc "Platform stats for admin dashboard."
  def platform_stats do
    week_ago = DateTime.add(DateTime.utc_now(), -7, :day)

    %{
      total_users: Repo.aggregate(User, :count, :id),
      plus_subscribers: Repo.aggregate(
        from(u in User, where: u.subscription_tier == "plus"),
        :count, :id
      ),
      ink_donors: Repo.aggregate(
        from(u in User, where: u.ink_donor_status == "active"),
        :count, :id
      ),
      signups_this_week: Repo.aggregate(
        from(u in User, where: u.inserted_at >= ^week_ago),
        :count, :id
      ),
      total_entries: Repo.aggregate(
        from(e in Inkwell.Journals.Entry, where: e.status == :published),
        :count, :id
      ),
      total_comments: Repo.aggregate(Inkwell.Journals.Comment, :count, :id),
      blocked_users: Repo.aggregate(
        from(u in User, where: not is_nil(u.blocked_at)),
        :count, :id
      ),
      inactive_users: Repo.aggregate(
        from(u in User, where: u.id not in subquery(active_user_ids_subquery())),
        :count, :id
      )
    }
  end

  @doc "Recent Plus subscribers (latest N users who have Plus)."
  def recent_plus_subscribers(limit \\ 10) do
    User
    |> where([u], u.subscription_tier == "plus")
    |> order_by(desc: :updated_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "Recent active Ink Donors (latest N)."
  def recent_ink_donors(limit \\ 10) do
    User
    |> where([u], u.ink_donor_status == "active")
    |> order_by(desc: :updated_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "Recent signups (latest N users)."
  def recent_signups(limit \\ 10) do
    User
    |> order_by(desc: :inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end

  # ── Search indexing helpers ───────────────────────────────────────────

  defp tap_ok({:ok, record} = result, fun) do
    fun.(record)
    result
  end
  defp tap_ok(result, _fun), do: result

  defp enqueue_search_index_user(%User{} = user) do
    %{action: "index_user", user_id: user.id}
    |> Inkwell.Workers.SearchIndexWorker.new()
    |> Oban.insert()
  end

  defp enqueue_search_delete_user(user_id) do
    %{action: "delete_user", user_id: user_id}
    |> Inkwell.Workers.SearchIndexWorker.new()
    |> Oban.insert()
  end

  defp enqueue_search_delete_user_entries(user_id) do
    %{action: "delete_user_entries", user_id: user_id}
    |> Inkwell.Workers.SearchIndexWorker.new()
    |> Oban.insert()
  end

  defp enqueue_search_reindex_user_entries(user_id) do
    %{action: "reindex_user_entries", user_id: user_id}
    |> Inkwell.Workers.SearchIndexWorker.new()
    |> Oban.insert()
  end
end
