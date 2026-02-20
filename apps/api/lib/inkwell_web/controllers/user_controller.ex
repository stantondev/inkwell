defmodule InkwellWeb.UserController do
  use InkwellWeb, :controller

  alias Inkwell.Accounts
  alias Inkwell.Journals
  alias Inkwell.Social

  # GET /api/users/:username — public profile
  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        entry_count = Journals.count_entries(user.id)
        top_friends = Social.list_top_friends(user.id)

        conn |> json(%{
          data: render_user(user),
          meta: %{
            entry_count: entry_count,
            top_friends: Enum.map(top_friends, fn {pos, u} ->
              %{position: pos, user: render_user_brief(u)}
            end)
          }
        })
    end
  end

  # GET /api/me — current user
  def me(conn, _params) do
    user = conn.assigns.current_user
    json(conn, %{data: render_user_full(user)})
  end

  # PATCH /api/me — update display_name, bio, pronouns, avatar_url, settings
  def update(conn, params) do
    user = conn.assigns.current_user
    allowed = Map.take(params, ["display_name", "bio", "pronouns", "avatar_url", "settings"])

    case Accounts.update_user_profile(user, allowed) do
      {:ok, updated} ->
        json(conn, %{data: render_user_full(updated)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # PATCH /api/me/profile — update profile_html and profile_css (Plus only)
  def update_profile(conn, params) do
    user = conn.assigns.current_user
    allowed = Map.take(params, ["profile_html", "profile_css"])

    case Accounts.update_user_profile(user, allowed) do
      {:ok, updated} ->
        json(conn, %{data: render_user_full(updated)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # ── Renderers ────────────────────────────────────────────────────────────

  def render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      pronouns: user.pronouns,
      avatar_url: user.avatar_url,
      ap_id: user.ap_id,
      created_at: user.inserted_at
    }
  end

  def render_user_brief(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url
    }
  end

  defp render_user_full(user) do
    user
    |> render_user()
    |> Map.merge(%{
      email: user.email,
      profile_html: user.profile_html,
      profile_css: user.profile_css,
      settings: user.settings
    })
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
