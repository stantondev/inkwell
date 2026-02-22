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

  # Admin

  def is_admin?(%User{username: username}) do
    admin_usernames = Application.get_env(:inkwell, :admin_usernames, [])
    username in admin_usernames
  end
  def is_admin?(_), do: false
end
