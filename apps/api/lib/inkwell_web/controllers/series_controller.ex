defmodule InkwellWeb.SeriesController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals}

  @free_series_limit 5

  # GET /api/users/:username/series — public listing
  def index(conn, %{"username" => username}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username) do
      series_list = Journals.list_series(user.id)

      # Filter to only series that have at least one published entry
      series_with_entries = Enum.filter(series_list, fn s -> Map.get(s, :entry_count, 0) > 0 end)

      json(conn, %{data: Enum.map(series_with_entries, &render_series/1)})
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "User not found"})
    end
  end

  # GET /api/users/:username/series/:slug — series detail with entries
  def show(conn, %{"username" => username, "slug" => slug}) do
    viewer = conn.assigns[:current_user]

    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         series when not is_nil(series) <- Journals.get_series_by_slug(user.id, slug) do

      viewer_id = if viewer, do: viewer.id, else: nil
      entries = Journals.list_series_entries(series.id, viewer_id)

      json(conn, %{
        data: %{
          id: series.id,
          title: series.title,
          slug: series.slug,
          description: series.description,
          cover_image_id: series.cover_image_id,
          status: series.status,
          entry_count: length(entries),
          author: InkwellWeb.UserController.render_user(user),
          entries: Enum.map(entries, fn entry ->
            InkwellWeb.EntryController.render_entry(entry)
          end),
          created_at: series.inserted_at,
          updated_at: series.updated_at
        }
      })
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
    end
  end

  # GET /api/series — current user's series (for management + editor dropdown)
  def list_own(conn, _params) do
    user = conn.assigns.current_user
    series_list = Journals.list_series(user.id)

    json(conn, %{
      data: Enum.map(series_list, &render_series_with_entries/1),
      meta: %{
        count: length(series_list),
        limit: if((user.subscription_tier || "free") == "plus", do: nil, else: @free_series_limit)
      }
    })
  end

  # POST /api/series
  def create(conn, params) do
    user = conn.assigns.current_user

    if (user.subscription_tier || "free") != "plus" do
      current_count = Journals.count_series(user.id)
      if current_count >= @free_series_limit do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "series_limit_reached"})
      else
        do_create(conn, user, params)
      end
    else
      do_create(conn, user, params)
    end
  end

  defp do_create(conn, user, params) do
    attrs =
      params
      |> Map.take(["title", "description", "cover_image_id", "status"])
      |> Map.put("user_id", user.id)

    case Journals.create_series(attrs) do
      {:ok, series} ->
        conn |> put_status(:created) |> json(%{data: render_series(series)})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  # PATCH /api/series/:id
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, series} <- get_owned_series(user.id, id) do
      attrs = Map.take(params, ["title", "description", "cover_image_id", "status"])

      case Journals.update_series(series, attrs) do
        {:ok, updated} -> json(conn, %{data: render_series(updated)})
        {:error, changeset} ->
          conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
      end
    end
  end

  # DELETE /api/series/:id
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, series} <- get_owned_series(user.id, id) do
      {:ok, _} = Journals.delete_series(series)
      send_resp(conn, :no_content, "")
    end
  end

  # PUT /api/series/:id/entries — reorder entries
  def reorder(conn, %{"id" => id, "entry_ids" => entry_ids}) when is_list(entry_ids) do
    user = conn.assigns.current_user

    with {:ok, _series} <- get_owned_series(user.id, id) do
      case Journals.reorder_series_entries(id, entry_ids) do
        :ok -> json(conn, %{ok: true})
        {:error, reason} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
      end
    end
  end

  def reorder(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "entry_ids array required"})
  end

  # ── Helpers ───────────────────────────────────────────────────────────────

  defp get_owned_series(user_id, series_id) do
    case Journals.get_series(series_id) do
      nil -> {:error, :not_found}
      series when series.user_id == user_id -> {:ok, series}
      _ -> {:error, :forbidden}
    end
  end

  defp render_series(series) do
    %{
      id: series.id,
      title: series.title,
      slug: series.slug,
      description: series.description,
      cover_image_id: series.cover_image_id,
      status: series.status,
      entry_count: Map.get(series, :entry_count, 0),
      created_at: series.inserted_at,
      updated_at: series.updated_at
    }
  end

  defp render_series_with_entries(series) do
    series
    |> render_series()
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
