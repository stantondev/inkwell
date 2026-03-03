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

        relationship_status =
          case conn.assigns[:current_user] do
            nil -> nil
            %{id: id} when id == user.id -> nil
            current_user ->
              case Social.get_block_status(current_user.id, user.id) do
                :blocked_by_me -> "blocked_by_me"
                :mutual_block -> "blocked_by_me"
                :blocked_by_them -> "unavailable"
                nil ->
                  case Social.get_relationship(current_user.id, user.id) do
                    {:ok, rel} -> to_string(rel.status)
                    {:error, :not_found} -> nil
                  end
              end
          end

        entry_years = Journals.list_entry_years(user.id)
        entry_tags = Journals.list_entry_tags(user.id)
        entry_categories = Journals.list_entry_categories(user.id)
        pen_pal_count = Social.count_pen_pals(user.id)
        reader_count = Social.count_readers(user.id)

        conn |> json(%{
          data: render_user(user),
          meta: %{
            entry_count: entry_count,
            pen_pal_count: pen_pal_count,
            reader_count: reader_count,
            relationship_status: relationship_status,
            top_friends: Enum.map(top_friends, fn {pos, u} ->
              %{position: pos, user: render_user_brief(u)}
            end),
            entry_years: entry_years,
            entry_tags: Enum.map(entry_tags, fn {tag, count} -> %{tag: tag, count: count} end),
            entry_categories: entry_categories
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
    is_plus = (user.subscription_tier || "free") == "plus"

    # Free-tier fields (always allowed)
    free_fields = [
      "display_name", "bio", "bio_html", "pronouns", "avatar_url", "avatar_config", "settings",
      "profile_status", "profile_theme", "profile_entry_display",
      "profile_background_url", "profile_banner_url", "avatar_frame",
      "support_url", "support_label",
      "pinned_entry_ids", "social_links"
    ]

    # Plus-only profile customization fields (silently stripped for free users)
    plus_fields = [
      "profile_music", "profile_background_color", "profile_accent_color",
      "profile_foreground_color", "profile_font", "profile_layout",
      "profile_widgets"
    ]

    allowed_keys = if is_plus, do: free_fields ++ plus_fields, else: free_fields
    allowed = Map.take(params, allowed_keys)

    # When bio_html is sent, sanitize it and auto-derive plain text bio
    allowed =
      case Map.get(allowed, "bio_html") do
        nil -> allowed
        html ->
          sanitized = sanitize_profile_html(html)
          plain =
            sanitized
            |> String.replace(~r/<[^>]*>/, "")
            |> String.replace(~r/&[^;]+;/, " ")
            |> String.replace(~r/\s+/, " ")
            |> String.trim()
            |> String.slice(0, 2000)
          allowed |> Map.put("bio_html", sanitized) |> Map.put("bio", plain)
      end

    # Merge settings instead of replacing, so {onboarded: true} doesn't wipe other settings
    allowed =
      case Map.get(allowed, "settings") do
        nil -> allowed
        new_settings when is_map(new_settings) ->
          merged = Map.merge(user.settings || %{}, new_settings)
          merged = sanitize_redacted_words(merged)
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

  # GET /api/discover/writers — recently active public writers (authenticated)
  def suggested(conn, _params) do
    user = conn.assigns.current_user
    users = Accounts.list_suggested_users(user.id)

    data =
      Enum.map(users, fn u ->
        %{
          id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          bio: u.bio,
          bio_html: u.bio_html
        }
      end)

    json(conn, %{data: data})
  end

  # GET /api/username-available?username=foo (public)
  def username_available(conn, %{"username" => username}) do
    available = Accounts.username_available?(username)
    json(conn, %{available: available})
  end

  # GET /api/users/mention-search?q=prefix — search users by username prefix for @mentions
  def mention_search(conn, %{"q" => q}) do
    viewer = conn.assigns[:current_user]
    blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []
    users = Accounts.search_users_by_prefix(q, 8, blocked_ids)
    json(conn, %{data: users})
  end

  def mention_search(conn, _params) do
    json(conn, %{data: []})
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

    has_html = Map.has_key?(params, "profile_html") and params["profile_html"] not in [nil, ""]
    has_css = Map.has_key?(params, "profile_css") and params["profile_css"] not in [nil, ""]

    # Custom HTML/CSS is Plus-only
    if (has_html or has_css) and (user.subscription_tier || "free") != "plus" do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Custom HTML and CSS require an Inkwell Plus subscription"})
    else
      allowed = Map.take(params, ["profile_html", "profile_css"])

      # Sanitize HTML server-side
      allowed =
        case Map.get(allowed, "profile_html") do
          nil -> allowed
          html -> Map.put(allowed, "profile_html", sanitize_profile_html(html))
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
  end

  # POST /api/me/background — upload profile background image (Plus only)
  def upload_background(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    # Background image upload is Plus-only
    if (user.subscription_tier || "free") != "plus" do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Background image upload requires an Inkwell Plus subscription"})
    else
      upload_background_impl(conn, user, image_data)
    end
  end

  defp upload_background_impl(conn, user, image_data) do
    case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s, image_data) do
      [_, _type, base64] ->
        # Max ~5MB of base64 = ~3.75MB image
        if byte_size(base64) > 7_000_000 do
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Image too large — max 5MB"})
        else
          case Accounts.update_user_profile(user, %{"profile_background_url" => image_data}) do
            {:ok, updated} ->
              json(conn, %{data: render_user_full(updated)})

            {:error, _changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Could not save background image"})
          end
        end

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid image format — must be a data:image/... URI"})
    end
  end

  def upload_background(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing image parameter"})
  end

  # POST /api/me/banner — upload profile banner/header image (free for all users)
  def upload_banner(conn, %{"image" => image_data}) when is_binary(image_data) do
    user = conn.assigns.current_user

    case Regex.run(~r/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s, image_data) do
      [_, _type, base64] ->
        # Max ~5MB of base64
        if byte_size(base64) > 7_000_000 do
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Image too large — max 5MB"})
        else
          case Accounts.update_user_profile(user, %{"profile_banner_url" => image_data}) do
            {:ok, updated} ->
              json(conn, %{data: render_user_full(updated)})

            {:error, _changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Could not save banner"})
          end
        end

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Invalid image format — must be a data:image/... URI"})
    end
  end

  def upload_banner(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing image parameter"})
  end

  # GET /api/avatars/:username — serve avatar as image (public, for federation)
  def serve_avatar(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      %{avatar_url: nil} ->
        conn |> put_status(:not_found) |> json(%{error: "No avatar"})

      %{avatar_url: avatar_url, updated_at: updated_at} ->
        serve_data_uri_image(conn, avatar_url, updated_at)
    end
  end

  # GET /api/banners/:username — serve banner as image (public, for federation)
  def serve_banner(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      %{profile_banner_url: nil} ->
        conn |> put_status(:not_found) |> json(%{error: "No banner"})

      user ->
        serve_data_uri_image(conn, user.profile_banner_url, user.updated_at)
    end
  end

  defp serve_data_uri_image(conn, data_uri, updated_at) do
    case Regex.run(~r/^data:image\/([^;]+);base64,(.+)$/s, data_uri) do
      [_, type, base64] ->
        case Base.decode64(base64) do
          {:ok, binary} ->
            content_type = "image/#{if type == "jpg", do: "jpeg", else: type}"
            etag = :crypto.hash(:md5, "#{updated_at}") |> Base.encode16(case: :lower)

            conn
            |> put_resp_content_type(content_type)
            |> put_resp_header("cache-control", "public, max-age=86400")
            |> put_resp_header("etag", ~s("#{etag}"))
            |> send_resp(200, binary)

          :error ->
            conn |> put_status(:internal_server_error) |> json(%{error: "Corrupt image"})
        end

      _ ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Invalid image data"})
    end
  end

  # DELETE /api/me — permanently delete the current user's account
  def delete_account(conn, %{"username" => confirmation_username}) do
    user = conn.assigns.current_user

    if confirmation_username == user.username do
      case Accounts.delete_account(user) do
        {:ok, _} ->
          json(conn, %{ok: true})

        {:error, _reason} ->
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Failed to delete account. Please try again."})
      end
    else
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "Username confirmation does not match."})
    end
  end

  def delete_account(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Username confirmation is required."})
  end

  # ── Renderers ────────────────────────────────────────────────────────────

  def render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      bio_html: user.bio_html,
      pronouns: user.pronouns,
      avatar_url: user.avatar_url,
      avatar_config: user.avatar_config,
      ap_id: user.ap_id,
      subscription_tier: user.subscription_tier || "free",
      created_at: user.inserted_at,
      profile_html: user.profile_html,
      profile_css: user.profile_css,
      profile_music: user.profile_music,
      profile_background_url: user.profile_background_url,
      profile_background_color: user.profile_background_color,
      profile_accent_color: user.profile_accent_color,
      profile_foreground_color: user.profile_foreground_color,
      profile_font: user.profile_font,
      profile_layout: user.profile_layout,
      profile_widgets: user.profile_widgets,
      profile_banner_url: user.profile_banner_url,
      profile_status: user.profile_status,
      profile_theme: user.profile_theme,
      profile_entry_display: user.profile_entry_display || "cards",
      avatar_frame: user.avatar_frame,
      newsletter_enabled: user.newsletter_enabled || false,
      newsletter_name: user.newsletter_name,
      newsletter_description: user.newsletter_description,
      subscriber_count: Inkwell.Newsletter.count_subscribers(user.id),
      support_url: user.support_url,
      support_label: user.support_label,
      stripe_connect_enabled: user.stripe_connect_enabled || false,
      pinned_entry_ids: user.pinned_entry_ids || [],
      social_links: user.social_links || %{},
      ink_donor_status: user.ink_donor_status,
      ink_donor_amount_cents: user.ink_donor_amount_cents
    }
  end

  def render_user_brief(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      avatar_frame: user.avatar_frame
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
      subscription_expires_at: user.subscription_expires_at,
      stripe_connect_account_id: user.stripe_connect_account_id,
      stripe_connect_onboarded: user.stripe_connect_onboarded || false,
      sends_this_month: Inkwell.Newsletter.count_sends_this_month(user.id),
      send_limit: Inkwell.Newsletter.send_limit(user.subscription_tier)
    })
  end

  defp sanitize_profile_html(html) do
    html
    |> String.replace(~r/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/is, "")
    |> String.replace(~r/<script\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    |> String.replace(~r/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/i, "\\1=\"\"")
    |> String.replace(~r/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/is, "")
    |> String.replace(~r/<iframe\b[^>]*\/?\s*>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/is, "")
    |> String.replace(~r/<(object|embed|applet)\b[^>]*\/?\s*>/is, "")
  end

  defp sanitize_redacted_words(settings) do
    case Map.get(settings, "redacted_words") do
      nil -> settings
      words when is_list(words) ->
        cleaned =
          words
          |> Enum.map(fn
            w when is_binary(w) -> w |> String.trim() |> String.downcase() |> String.slice(0, 100)
            _ -> ""
          end)
          |> Enum.reject(&(&1 == ""))
          |> Enum.uniq()
          |> Enum.take(100)
        Map.put(settings, "redacted_words", cleaned)
      _ ->
        Map.delete(settings, "redacted_words")
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
