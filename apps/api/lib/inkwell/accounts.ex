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
    not Repo.exists?(from u in User, where: u.username == ^username)
  end

  # Returns recently active public writers, excluding current user and anyone already followed/pending.
  def list_suggested_users(current_user_id, limit \\ 12) do
    already_following =
      from r in Inkwell.Social.Relationship,
        where: r.follower_id == ^current_user_id and r.status in [:pending, :accepted],
        select: r.following_id

    # Primary: users with published public entries, ordered by most recent
    writers =
      from u in User,
        join: e in Inkwell.Journals.Entry, on: e.user_id == u.id,
        where: e.status == :published and e.privacy == :public,
        where: u.id != ^current_user_id,
        where: u.id not in subquery(already_following),
        where: is_nil(u.blocked_at),
        group_by: u.id,
        order_by: [desc: max(e.inserted_at)],
        limit: ^limit,
        select: u

    results = Repo.all(writers)

    # Fallback: if not enough writers with entries, pad with recently joined users
    if length(results) < limit do
      writer_ids = Enum.map(results, & &1.id)
      remaining = limit - length(results)

      fallback =
        from u in User,
          where: u.id != ^current_user_id,
          where: u.id not in ^writer_ids,
          where: u.id not in subquery(already_following),
          where: is_nil(u.blocked_at),
          where: not is_nil(u.username),
          order_by: [desc: u.inserted_at],
          limit: ^remaining,
          select: u

      results ++ Repo.all(fallback)
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
    %Notification{}
    |> Notification.changeset(attrs)
    |> Repo.insert()
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
    # Cancel Stripe subscription if active
    if user.stripe_subscription_id do
      Inkwell.Billing.cancel_subscription(user.stripe_subscription_id)
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
        # Revoke all auth tokens to force sign out
        Inkwell.Auth.revoke_all_user_tokens(user.id)
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
