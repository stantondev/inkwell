defmodule InkwellWeb.EntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Repo, Social, Stamps}
  alias InkwellWeb.UserController

  # GET /api/users/:username/entries — public listing
  def index(conn, %{"username" => username} = params) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username) do
      viewer = conn.assigns[:current_user]
      page = parse_int(params["page"], 1)
      per_page = parse_int(params["per_page"], 20)

      opts = [page: page, per_page: per_page]

      entries =
        cond do
          viewer && viewer.id == user.id ->
            # Owner: see everything (published only — drafts are separate)
            Journals.list_entries(user.id, opts)

          viewer && Social.is_friend?(viewer.id, user.id) ->
            # Friends: public + friends_only + custom entries where viewer is in the filter
            all = Journals.list_entries(user.id, Keyword.put(opts, :privacy, [:public, :friends_only, :custom]))
            Enum.filter(all, fn entry ->
              entry.privacy != :custom || viewer_in_custom_filter?(entry, viewer.id)
            end)

          true ->
            Journals.list_public_entries(user.id, opts)
        end

      entry_ids = Enum.map(entries, & &1.id)
      stamp_types_map = Stamps.get_stamp_types_for_entries(entry_ids)

      json(conn, %{
        data: Enum.map(entries, fn entry ->
          render_entry(entry)
          |> Map.put(:stamps, Map.get(stamp_types_map, entry.id, []))
        end),
        pagination: %{page: page, per_page: per_page}
      })
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # GET /api/users/:username/entries/:slug — single entry
  def show(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         entry when not is_nil(entry) <- Journals.get_entry_by_slug(user.id, slug),
         :published <- entry.status do

      viewer = conn.assigns[:current_user]

      render_with_stamps = fn ->
        stamp_types = Stamps.get_entry_stamp_types(entry.id)
        my_stamp = if viewer, do: Stamps.get_user_stamp(viewer.id, entry.id), else: nil

        render_entry_full(entry, user)
        |> Map.put(:stamps, stamp_types)
        |> Map.put(:my_stamp, if(my_stamp, do: Atom.to_string(my_stamp.stamp_type), else: nil))
      end

      cond do
        entry.privacy == :public ->
          json(conn, %{data: render_with_stamps.()})

        entry.privacy == :private ->
          if viewer && viewer.id == user.id do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        entry.privacy == :friends_only ->
          if viewer && (viewer.id == user.id || Social.is_friend?(viewer.id, user.id)) do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        entry.privacy == :custom ->
          if viewer && (viewer.id == user.id || viewer_in_custom_filter?(entry, viewer.id)) do
            json(conn, %{data: render_with_stamps.()})
          else
            conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
          end

        true ->
          conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      end
    else
      :draft -> conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # GET /api/entries/:id — fetch own entry for editing (works for both drafts and published)
  def show_own(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_owned_entry(user.id, id) do
      {:ok, entry} ->
        json(conn, %{data: render_entry_full(entry, user)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
    end
  end

  # POST /api/entries
  def create(conn, params) do
    user = conn.assigns.current_user
    is_draft = params["status"] == "draft"

    if is_draft do
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                      "privacy", "user_icon_id", "tags", "custom_filter_id"])
        |> Map.put("user_id", user.id)
        |> maybe_clear_custom_filter_id()

      case Journals.create_draft(attrs) do
        {:ok, entry} ->
          conn
          |> put_status(:created)
          |> json(%{data: render_entry_full(entry, user)})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{errors: format_errors(changeset)})
      end
    else
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                      "privacy", "user_icon_id", "tags", "published_at", "custom_filter_id"])
        |> Map.put("user_id", user.id)
        |> maybe_generate_slug(params)
        |> maybe_generate_ap_id(user)
        |> maybe_clear_custom_filter_id()

      with :ok <- validate_custom_filter_ownership(attrs, user.id) do
        case Journals.create_entry(attrs) do
          {:ok, entry} ->
            conn
            |> put_status(:created)
            |> json(%{data: render_entry_full(entry, user)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      else
        {:error, :filter_not_found} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})
      end
    end
  end

  # PATCH /api/entries/:id
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, id) do
      attrs =
        params
        |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                       "privacy", "user_icon_id", "tags", "published_at", "custom_filter_id"])
        |> maybe_clear_custom_filter_id()

      with :ok <- validate_custom_filter_ownership(attrs, user.id) do
        result =
          if entry.status == :draft do
            Journals.update_draft(entry, attrs)
          else
            Journals.update_entry(entry, attrs)
          end

        case result do
          {:ok, updated} ->
            json(conn, %{data: render_entry_full(updated, user)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      else
        {:error, :filter_not_found} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # POST /api/entries/:id/publish — transition draft → published
  def publish(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, id) do
      if entry.status != :draft do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Entry is already published"})
      else
        attrs =
          params
          |> Map.take(["title", "body_html", "body_raw", "mood", "music", "music_metadata",
                        "privacy", "user_icon_id", "tags", "custom_filter_id"])
          |> maybe_generate_slug(params)
          |> maybe_generate_ap_id(user)
          |> maybe_clear_custom_filter_id()

        with :ok <- validate_custom_filter_ownership(attrs, user.id) do
          case Journals.publish_draft(entry, attrs) do
            {:ok, published} ->
              json(conn, %{data: render_entry_full(published, user)})

            {:error, changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{errors: format_errors(changeset)})
          end
        else
          {:error, :filter_not_found} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Filter not found or does not belong to you"})
        end
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # GET /api/drafts — list current user's drafts
  def list_drafts(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    drafts = Journals.list_drafts(user.id, page: page, per_page: per_page)

    json(conn, %{
      data: Enum.map(drafts, &render_entry/1),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # DELETE /api/entries/:id
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    result =
      if Accounts.is_admin?(user) do
        try do
          {:ok, Journals.get_entry!(id)}
        rescue
          Ecto.NoResultsError -> {:error, :not_found}
        end
      else
        get_owned_entry(user.id, id)
      end

    with {:ok, entry} <- result do
      {:ok, _} = Journals.delete_entry(entry)
      send_resp(conn, :no_content, "")
    else
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # ── Helpers ───────────────────────────────────────────────────────────────

  defp viewer_in_custom_filter?(entry, viewer_id) do
    entry = Repo.preload(entry, :custom_filter)

    case entry.custom_filter do
      nil -> false
      filter -> viewer_id in filter.member_ids
    end
  end

  defp validate_custom_filter_ownership(attrs, user_id) do
    cond do
      attrs["privacy"] != "custom" -> :ok
      is_nil(attrs["custom_filter_id"]) -> :ok
      true ->
        filters = Social.list_friend_filters(user_id)
        if Enum.any?(filters, &(&1.id == attrs["custom_filter_id"])) do
          :ok
        else
          {:error, :filter_not_found}
        end
    end
  end

  # Clear custom_filter_id when privacy is not :custom
  defp maybe_clear_custom_filter_id(%{"privacy" => privacy} = attrs) when privacy != "custom" do
    Map.put(attrs, "custom_filter_id", nil)
  end
  defp maybe_clear_custom_filter_id(attrs), do: attrs

  defp get_owned_entry(user_id, entry_id) do
    entry = Journals.get_entry!(entry_id)

    if entry.user_id == user_id do
      {:ok, entry}
    else
      {:error, :forbidden}
    end
  rescue
    Ecto.NoResultsError ->
      {:error, :not_found}
  end

  defp maybe_generate_slug(attrs, params) do
    if Map.has_key?(attrs, "title") && attrs["title"] not in [nil, ""] do
      slug =
        attrs["title"]
        |> String.downcase()
        |> String.replace(~r/[^a-z0-9\s-]/, "")
        |> String.replace(~r/\s+/, "-")
        |> String.slice(0, 60)
        |> then(fn s -> "#{s}-#{:erlang.unique_integer([:positive])}" end)

      Map.put(attrs, "slug", slug)
    else
      ts = DateTime.utc_now() |> DateTime.to_unix()
      Map.put(attrs, "slug", "entry-#{ts}")
    end
  end

  defp maybe_generate_ap_id(attrs, user) do
    slug = Map.get(attrs, "slug", "")
    ap_id = "https://inkwell.social/users/#{user.username}/entries/#{slug}"
    Map.put(attrs, "ap_id", ap_id)
  end

  def render_entry(entry) do
    %{
      id: entry.id,
      user_id: entry.user_id,
      title: entry.title,
      body_html: entry.body_html,
      body_raw: entry.body_raw,
      mood: entry.mood,
      music: entry.music,
      music_metadata: entry.music_metadata,
      privacy: entry.privacy,
      custom_filter_id: entry.custom_filter_id,
      user_icon_id: entry.user_icon_id,
      slug: entry.slug,
      tags: entry.tags,
      published_at: entry.published_at,
      ap_id: entry.ap_id,
      status: entry.status,
      created_at: entry.inserted_at,
      updated_at: entry.updated_at
    }
  end

  def render_entry_full(entry, author) do
    entry
    |> render_entry()
    |> Map.put(:author, UserController.render_user(author))
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
