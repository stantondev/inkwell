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
  end

  def update_username(%User{} = user, attrs) do
    user
    |> User.username_changeset(attrs)
    |> Repo.update()
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

      query =
        User
        |> where([u], like(u.username, ^like_pattern))
        |> where([u], not is_nil(u.username))
        |> where([u], is_nil(u.blocked_at))
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
    writers =
      from u in User,
        join: e in Inkwell.Journals.Entry, on: e.user_id == u.id,
        where: e.status == :published and e.privacy == :public,
        where: u.id != ^current_user_id,
        where: u.id not in subquery(already_following),
        where: u.id not in ^blocked_ids,
        where: is_nil(u.blocked_at),
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
            group_by: u.id,
            order_by: [desc: count(e.id)],
            limit: ^remaining,
            select: %{user: u, entry_count: count(e.id), total_ink_count: sum(coalesce(e.ink_count, 0))}

        results ++ Repo.all(fallback)
      else
        results
      end

    # Final fallback: pad with recently joined users (no entries yet)
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
          order_by: [desc: u.inserted_at],
          limit: ^remaining,
          select: u

      results ++ Enum.map(Repo.all(fallback), fn u -> %{user: u, entry_count: 0, total_ink_count: 0} end)
    else
      results
    end
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

  def create_notification(attrs) do
    user_id = attrs[:user_id] || attrs["user_id"]
    actor_id = attrs[:actor_id] || attrs["actor_id"]

    # Skip notification if block exists between these users
    if actor_id && Inkwell.Social.is_blocked_between?(user_id, actor_id) do
      {:ok, :blocked_skipped}
    else
      %Notification{}
      |> Notification.changeset(attrs)
      |> Repo.insert()
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
      "blocked" -> where(query, [u], not is_nil(u.blocked_at))
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

  @doc "Recent signups (latest N users)."
  def recent_signups(limit \\ 10) do
    User
    |> order_by(desc: :inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end
end
