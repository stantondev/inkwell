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

    # Merge settings instead of replacing, so {onboarded: true} doesn't wipe other settings
    allowed =
      case Map.get(allowed, "settings") do
        nil -> allowed
        new_settings when is_map(new_settings) ->
          merged = Map.merge(user.settings || %{}, new_settings)
          Map.put(allowed, "settings", merged)
        _ -> allowed
      end

    case Accounts.update_user_profile(user, allowed) do
      {:ok, updated} ->
        json(conn, %{data: render_user_full(updated)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # PATCH /api/me/username — change username (for onboarding)
  def update_username(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    case Accounts.update_username(user, %{"username" => username}) do
      {:ok, updated} ->
        json(conn, %{data: render_user_full(updated)})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # GET /api/username-available?username=foo (public)
  def username_available(conn, %{"username" => username}) do
    available = Accounts.username_available?(username)
    json(conn, %{available: available})
  end

  # POST /api/me/avatar — upload avatar image (accepts base64 JSON body)
  # Body: { "image": "data:image/png;base64,..." }
  def upload_avatar(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    # Validate it's a data URI with a supported image type
    case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s, image_data) do
      [_, _type, base64] ->
        # Validate size (max ~2MB of base64 = ~1.5MB image)
        if byte_size(base64) > 2_800_000 do
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Image too large — max 2MB"})
        else
          case Accounts.update_user_profile(user, %{"avatar_url" => image_data}) do
            {:ok, updated} ->
              json(conn, %{data: render_user_full(updated)})

            {:error, _changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Could not save avatar"})
          end
        end

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid image format — must be a data:image/... URI"})
    end
  end

  def upload_avatar(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing image parameter"})
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
      subscription_tier: user.subscription_tier || "free",
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
      settings: user.settings,
      subscription_status: user.subscription_status || "none",
      subscription_expires_at: user.subscription_expires_at
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
