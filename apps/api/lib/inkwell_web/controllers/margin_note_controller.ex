defmodule InkwellWeb.MarginNoteController do
  @moduledoc """
  CRUD for inline marginalia — reader annotations anchored to text
  ranges in a published entry. See CLAUDE.md > "Inline Marginalia".
  """

  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, MarginNotes, Social}
  alias Inkwell.MarginNotes.MarginNote

  # GET /api/entries/:entry_id/margin-notes
  # optional_auth — public, but filters blocked users when viewer is signed in
  def index(conn, %{"entry_id" => entry_id}) do
    viewer = conn.assigns[:current_user]

    with {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_visible(entry, viewer) do
      exclude_ids =
        if viewer do
          Social.get_blocked_user_ids(viewer.id)
        else
          []
        end

      notes = MarginNotes.list_for_entry(entry.id, exclude_user_ids: exclude_ids)
      orphans = MarginNotes.list_for_entry(entry.id, orphaned: true, exclude_user_ids: exclude_ids)

      json(conn, %{
        data: %{
          notes: Enum.map(notes, &render_note/1),
          orphaned: Enum.map(orphans, &render_note/1)
        }
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :forbidden} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # POST /api/entries/:entry_id/margin-notes
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_visible(entry, user),
         :ok <- validate_not_blocked(entry, user),
         :ok <- validate_under_per_user_cap(entry, user) do
      attrs =
        %{
          entry_id: entry.id,
          user_id: user.id,
          quote_text: params["quote_text"],
          quote_prefix: params["quote_prefix"] || "",
          quote_suffix: params["quote_suffix"] || "",
          text_position_start: parse_int(params["text_position_start"]),
          text_position_end: parse_int(params["text_position_end"]),
          note_html: params["note_html"]
        }

      case MarginNotes.create_note(attrs) do
        {:ok, note} ->
          maybe_notify_entry_author(entry, user, note)

          conn
          |> put_status(:created)
          |> json(%{data: render_note(note)})

        {:error, %Ecto.Changeset{} = changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Validation failed", details: format_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot annotate this entry"})

      {:error, :forbidden} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{
          error:
            "You've reached the annotation limit for this entry (#{MarginNotes.per_user_per_entry_limit()})"
        })
    end
  end

  # PATCH /api/margin-notes/:id
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case MarginNotes.get_note(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Note not found"})

      %MarginNote{user_id: uid} = note when uid == user.id ->
        case MarginNotes.update_note(note, %{note_html: params["note_html"]}) do
          {:ok, updated} ->
            json(conn, %{data: render_note(updated)})

          {:error, :expired} ->
            conn
            |> put_status(:forbidden)
            |> json(%{error: "Edit window has expired"})

          {:error, %Ecto.Changeset{} = changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "Validation failed", details: format_errors(changeset)})
        end

      _ ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your note"})
    end
  end

  # DELETE /api/margin-notes/:id
  # Allowed for the note author OR the entry author.
  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case MarginNotes.get_note(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Note not found"})

      %MarginNote{} = note ->
        entry = Journals.get_entry!(note.entry_id)

        if note.user_id == user.id or entry.user_id == user.id do
          {:ok, _} = MarginNotes.delete_note(note)
          json(conn, %{data: %{ok: true}})
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not allowed"})
        end
    end
  rescue
    Ecto.NoResultsError ->
      conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
  end

  # ── helpers ─────────────────────────────────────────────────────────

  defp get_entry(entry_id) do
    {:ok, Journals.get_entry!(entry_id)}
  rescue
    Ecto.NoResultsError -> {:error, :not_found}
  end

  # Only public, published entries can receive marginalia. Private entries
  # can still be annotated by the author themselves (self-annotation is
  # explicitly a valid use case).
  defp validate_visible(entry, viewer) do
    cond do
      entry.status != :published -> {:error, :forbidden}
      entry.privacy == :public -> :ok
      viewer && viewer.id == entry.user_id -> :ok
      entry.privacy == :friends_only and viewer && Social.is_friend?(viewer.id, entry.user_id) -> :ok
      true -> {:error, :forbidden}
    end
  end

  defp validate_not_blocked(entry, user) do
    if user.id != entry.user_id and Social.is_blocked_between?(user.id, entry.user_id) do
      {:error, :blocked}
    else
      :ok
    end
  end

  defp validate_under_per_user_cap(entry, user) do
    count = MarginNotes.count_by_user_for_entry(user.id, entry.id)

    if count >= MarginNotes.per_user_per_entry_limit() do
      {:error, :rate_limited}
    else
      :ok
    end
  end

  defp maybe_notify_entry_author(entry, actor, note) do
    # Skip self-annotation notifications
    if entry.user_id != actor.id do
      entry_author = Accounts.get_user!(entry.user_id)

      Accounts.create_notification(%{
        type: :margin_note,
        user_id: entry.user_id,
        actor_id: actor.id,
        target_type: "entry",
        target_id: entry.id,
        data: %{
          "margin_note_id" => note.id,
          "quote_snippet" => snippet(note.quote_text),
          "entry_title" => entry.title,
          "entry_slug" => entry.slug,
          "entry_username" => entry_author.username
        }
      })
    end
  end

  defp snippet(text) when is_binary(text) do
    trimmed = String.trim(text)

    if String.length(trimmed) > 120 do
      String.slice(trimmed, 0, 117) <> "…"
    else
      trimmed
    end
  end

  defp snippet(_), do: ""

  defp parse_int(nil), do: nil
  defp parse_int(n) when is_integer(n), do: n

  defp parse_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, _} -> n
      :error -> nil
    end
  end

  defp parse_int(_), do: nil

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  @doc false
  def render_note(note) do
    author =
      if note.user do
        %{
          id: note.user.id,
          username: note.user.username,
          display_name: note.user.display_name,
          avatar_url: note.user.avatar_url,
          avatar_frame: note.user.avatar_frame,
          avatar_animation: note.user.avatar_animation,
          subscription_tier: note.user.subscription_tier
        }
      end

    %{
      id: note.id,
      entry_id: note.entry_id,
      user_id: note.user_id,
      quote_text: note.quote_text,
      quote_prefix: note.quote_prefix,
      quote_suffix: note.quote_suffix,
      text_position_start: note.text_position_start,
      text_position_end: note.text_position_end,
      note_html: note.note_html,
      author: author,
      orphaned: !is_nil(note.orphaned_at),
      created_at: note.inserted_at,
      edited_at: note.edited_at
    }
  end
end
