defmodule InkwellWeb.ReprintController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Reprints, Repo, Social}
  alias Inkwell.Federation.{RemoteEntries, Workers.FanOutWorker}

  # POST /api/entries/:entry_id/reprint — create a quote reprint of a local entry
  # Body: { "body_html": "<p>My thoughts...</p>" }
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user
    body_html = params["body_html"] || ""

    with {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_not_own_entry(entry, user),
         :ok <- validate_public(entry),
         :ok <- validate_not_blocked(entry, user),
         :ok <- validate_body(body_html) do

      # Derive title from original post
      quoted_title = if entry.title && entry.title != "", do: "RE: #{entry.title}", else: nil

      # Create a new published entry that quotes the original
      entry_attrs = %{
        user_id: user.id,
        title: quoted_title,
        body_html: body_html,
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now(),
        quoted_entry_id: entry_id,
        tags: [],
        word_count: count_words(body_html)
      }

      case Journals.create_entry(entry_attrs) do
        {:ok, quote_entry} ->
          # Create a reprint record for counting
          Reprints.toggle_reprint(user.id, entry_id)

          # Notify the original author
          Accounts.create_notification(%{
            type: :reprint,
            user_id: entry.user_id,
            actor_id: user.id,
            target_type: "entry",
            target_id: entry.id
          })

          # Fan out the quote entry to fediverse followers
          %{entry_id: quote_entry.id, action: "create", user_id: user.id}
          |> FanOutWorker.new()
          |> Oban.insert()

          # Load the quoted entry for response
          quoted = render_quoted_entry(entry)

          json(conn, %{
            data: %{
              id: quote_entry.id,
              slug: quote_entry.slug,
              reprinted: true,
              reprint_count: (Journals.get_entry!(entry_id)).reprint_count,
              quoted_entry: quoted
            }
          })

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: format_changeset_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :own_entry} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot reprint your own entry"})

      {:error, :not_public} ->
        conn |> put_status(:forbidden) |> json(%{error: "Only public entries can be reprinted"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot reprint this entry"})

      {:error, :body_required} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Please add your thoughts to the reprint"})
    end
  end

  # POST /api/entries/:entry_id/reprint/toggle — simple reprint toggle (no quote text)
  def toggle(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_not_own_entry(entry, user),
         :ok <- validate_public(entry),
         :ok <- validate_not_blocked(entry, user) do
      case Reprints.toggle_reprint(user.id, entry_id) do
        {:ok, {:created, _reprint}} ->
          Accounts.create_notification(%{
            type: :reprint,
            user_id: entry.user_id,
            actor_id: user.id,
            target_type: "entry",
            target_id: entry.id
          })

          # Send AP Announce to followers
          if entry.privacy == :public do
            %{entry_id: entry_id, action: "announce_repost", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          updated = Journals.get_entry!(entry_id)
          json(conn, %{data: %{reprinted: true, reprint_count: updated.reprint_count}})

        {:ok, {:removed, _}} ->
          # Send Undo { Announce } to followers
          if entry.privacy == :public do
            %{entry_id: entry_id, action: "undo_announce_repost", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          updated = Journals.get_entry!(entry_id)
          json(conn, %{data: %{reprinted: false, reprint_count: updated.reprint_count}})

        {:error, _changeset} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to process reprint"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :own_entry} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot reprint your own entry"})

      {:error, :not_public} ->
        conn |> put_status(:forbidden) |> json(%{error: "Only public entries can be reprinted"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot reprint this entry"})
    end
  end

  # POST /api/remote-entries/:id/reprint/toggle — simple reprint toggle for fediverse entries
  def toggle_remote(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        case Reprints.toggle_reprint_remote(user.id, id) do
          {:ok, {:created, _reprint}} ->
            remote_entry = Repo.preload(remote_entry, :remote_actor)

            # Send AP Announce to followers
            %{remote_entry_ap_id: remote_entry.ap_id, action: "announce_repost_remote", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()

            reprint_count = Reprints.count_reprints_for_remote_entries([id]) |> Map.get(id, 0)
            json(conn, %{data: %{reprinted: true, reprint_count: reprint_count}})

          {:ok, {:removed, _}} ->
            remote_entry = Repo.preload(remote_entry, :remote_actor)

            # Send Undo { Announce } to followers
            %{remote_entry_ap_id: remote_entry.ap_id, action: "undo_announce_repost_remote", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()

            reprint_count = Reprints.count_reprints_for_remote_entries([id]) |> Map.get(id, 0)
            json(conn, %{data: %{reprinted: false, reprint_count: reprint_count}})

          {:error, _changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to process reprint"})
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # POST /api/remote-entries/:id/reprint — create a quote reprint of a remote entry
  def create_remote(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    body_html = params["body_html"] || ""

    with {:ok, remote_entry} <- get_remote_entry(id),
         :ok <- validate_body(body_html) do

      # Derive title from original post
      quoted_title = if remote_entry.title && remote_entry.title != "", do: "RE: #{remote_entry.title}", else: nil

      # Create a new published entry that quotes the remote entry
      entry_attrs = %{
        user_id: user.id,
        title: quoted_title,
        body_html: body_html,
        privacy: :public,
        status: :published,
        published_at: DateTime.utc_now(),
        quoted_remote_entry_id: id,
        tags: [],
        word_count: count_words(body_html)
      }

      case Journals.create_entry(entry_attrs) do
        {:ok, quote_entry} ->
          # Create a reprint record for counting
          Reprints.toggle_reprint_remote(user.id, id)

          # Fan out the quote entry to fediverse followers
          %{entry_id: quote_entry.id, action: "create", user_id: user.id}
          |> FanOutWorker.new()
          |> Oban.insert()

          remote_entry = Repo.preload(remote_entry, :remote_actor)
          quoted = render_quoted_remote_entry(remote_entry)

          json(conn, %{
            data: %{
              id: quote_entry.id,
              slug: quote_entry.slug,
              reprinted: true,
              reprint_count: Reprints.count_reprints_for_remote_entries([id]) |> Map.get(id, 0),
              quoted_entry: quoted
            }
          })

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: format_changeset_errors(changeset)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})

      {:error, :body_required} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Please add your thoughts to the reprint"})
    end
  end

  # GET /api/entries/:entry_id/quote-preview — get entry data for the reprint modal preview
  def quote_preview(conn, %{"entry_id" => entry_id}) do
    case get_entry(entry_id) do
      {:ok, entry} ->
        entry = Repo.preload(entry, :user)
        json(conn, %{data: render_quoted_entry(entry)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # GET /api/remote-entries/:id/quote-preview — get remote entry data for reprint modal preview
  def quote_preview_remote(conn, %{"id" => id}) do
    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        remote_entry = Repo.preload(remote_entry, :remote_actor)
        json(conn, %{data: render_quoted_remote_entry(remote_entry)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────

  defp render_quoted_entry(entry) do
    entry = Repo.preload(entry, :user)
    author = entry.user

    %{
      id: entry.id,
      title: entry.title,
      excerpt: entry.excerpt || truncate_html(entry.body_html, 300),
      slug: entry.slug,
      cover_image_id: entry.cover_image_id,
      published_at: entry.published_at,
      word_count: entry.word_count,
      ink_count: entry.ink_count || 0,
      category: entry.category,
      author: %{
        username: author.username,
        display_name: author.display_name,
        avatar_url: author.avatar_url,
        avatar_frame: author.avatar_frame,
        avatar_animation: author.avatar_animation,
        subscription_tier: author.subscription_tier
      }
    }
  end

  defp render_quoted_remote_entry(remote_entry) do
    actor = remote_entry.remote_actor

    %{
      id: remote_entry.id,
      title: remote_entry.title,
      excerpt: truncate_html(remote_entry.body_html, 300),
      url: remote_entry.url,
      published_at: remote_entry.published_at,
      ink_count: remote_entry.likes_count || 0,
      author: %{
        username: actor.username,
        display_name: actor.display_name || actor.username,
        avatar_url: actor.avatar_url,
        avatar_frame: nil,
        domain: actor.domain
      }
    }
  end

  defp get_entry(entry_id) do
    {:ok, Journals.get_entry!(entry_id)}
  rescue
    Ecto.NoResultsError -> {:error, :not_found}
  end

  defp get_remote_entry(id) do
    case RemoteEntries.get_remote_entry(id) do
      nil -> {:error, :not_found}
      entry -> {:ok, entry}
    end
  end

  defp validate_not_own_entry(entry, user) do
    if entry.user_id == user.id, do: {:error, :own_entry}, else: :ok
  end

  defp validate_public(entry) do
    if entry.privacy == :public, do: :ok, else: {:error, :not_public}
  end

  defp validate_not_blocked(entry, user) do
    if Social.is_blocked_between?(user.id, entry.user_id), do: {:error, :blocked}, else: :ok
  end

  defp validate_body(body_html) do
    stripped = String.replace(body_html, ~r/<[^>]+>/, "") |> String.trim()
    if stripped == "", do: {:error, :body_required}, else: :ok
  end

  defp count_words(html) when is_binary(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> length()
  end
  defp count_words(_), do: 0

  defp truncate_html(nil, _), do: nil
  defp truncate_html(html, max_len) do
    text = String.replace(html, ~r/<[^>]+>/, "") |> String.trim()
    if String.length(text) > max_len do
      String.slice(text, 0, max_len) <> "..."
    else
      text
    end
  end

  defp format_changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
    |> Enum.map(fn {field, msgs} -> "#{field}: #{Enum.join(msgs, ", ")}" end)
    |> Enum.join("; ")
  end
end
