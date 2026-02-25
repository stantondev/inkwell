defmodule InkwellWeb.EntryVersionController do
  use InkwellWeb, :controller

  alias Inkwell.Journals

  # GET /api/entries/:entry_id/versions
  def index(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, entry_id) do
      page = parse_int(params["page"], 1)
      per_page = parse_int(params["per_page"], 50)

      versions = Journals.list_versions(entry.id, page: page, per_page: per_page)
      total = Journals.count_versions(entry.id)

      json(conn, %{
        data: Enum.map(versions, &render_version_summary/1),
        pagination: %{page: page, per_page: per_page, total: total}
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
    end
  end

  # GET /api/entries/:entry_id/versions/:id
  def show(conn, %{"entry_id" => entry_id, "id" => id}) do
    user = conn.assigns.current_user

    with {:ok, _entry} <- get_owned_entry(user.id, entry_id),
         version when not is_nil(version) <- Journals.get_version(id),
         true <- version.entry_id == entry_id do
      json(conn, %{data: render_version_full(version)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      _ ->
        conn |> put_status(:not_found) |> json(%{error: "Version not found"})
    end
  end

  # POST /api/entries/:entry_id/versions/:id/restore
  def restore(conn, %{"entry_id" => entry_id, "id" => id}) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_owned_entry(user.id, entry_id),
         version when not is_nil(version) <- Journals.get_version(id),
         true <- version.entry_id == entry_id do

      # Build attrs from the version snapshot
      attrs = %{
        "title" => version.title,
        "body_html" => version.body_html,
        "body_raw" => version.body_raw,
        "word_count" => version.word_count || 0,
        "excerpt" => version.excerpt,
        "mood" => version.mood,
        "tags" => version.tags || [],
        "category" => version.category,
        "cover_image_id" => version.cover_image_id
      }

      # Use normal update_entry which will create a version of the current state first
      case Journals.update_entry(entry, attrs, subscription_tier: user.subscription_tier || "free") do
        {:ok, restored} ->
          json(conn, %{data: InkwellWeb.EntryController.render_entry_full(restored, user)})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{errors: format_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your entry"})
      _ ->
        conn |> put_status(:not_found) |> json(%{error: "Version not found"})
    end
  end

  # ── Helpers ─────────────────────────────────────────────────────────────────

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

  defp render_version_summary(version) do
    %{
      id: version.id,
      entry_id: version.entry_id,
      version_number: version.version_number,
      title: version.title,
      word_count: version.word_count || 0,
      created_at: version.inserted_at
    }
  end

  defp render_version_full(version) do
    %{
      id: version.id,
      entry_id: version.entry_id,
      version_number: version.version_number,
      title: version.title,
      body_html: version.body_html,
      body_raw: version.body_raw,
      word_count: version.word_count || 0,
      excerpt: version.excerpt,
      mood: version.mood,
      tags: version.tags || [],
      category: version.category,
      cover_image_id: version.cover_image_id,
      created_at: version.inserted_at
    }
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
