defmodule InkwellWeb.RemoteEntryController do
  use InkwellWeb, :controller

  alias Inkwell.{Journals, Stamps}
  alias Inkwell.Federation.{ActivityBuilder, RemoteEntries, RemoteActor}
  alias Inkwell.Federation.Workers.DeliverActivityWorker
  alias Inkwell.Repo

  import Ecto.Query

  @valid_stamp_types ~w(felt holding_space beautifully_said rooting throwback i_cannot supporter)

  # POST /api/remote-entries/:id/stamp
  def stamp(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    stamp_type = params["stamp_type"]

    with :ok <- validate_stamp_type(stamp_type),
         :ok <- validate_plus_for_supporter(stamp_type, user),
         {:ok, remote_entry} <- get_remote_entry(id) do
      case Stamps.stamp_remote_entry(user.id, id, stamp_type) do
        {:ok, stamp, _action} ->
          # Send Like activity to the remote actor's inbox
          remote_entry = Repo.preload(remote_entry, :remote_actor)
          deliver_like(remote_entry, user)

          json(conn, %{data: %{
            stamp_type: Atom.to_string(stamp.stamp_type),
            stamps: Stamps.get_stamp_types_for_remote_entries([id]) |> Map.get(id, [])
          }})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: format_errors(changeset)})
      end
    else
      {:error, :invalid_stamp_type} ->
        conn |> put_status(:bad_request) |> json(%{error: "Invalid stamp type"})

      {:error, :plus_required} ->
        conn |> put_status(:forbidden) |> json(%{error: "Plus subscription required for this stamp"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # DELETE /api/remote-entries/:id/stamp
  def unstamp(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        case Stamps.remove_remote_stamp(user.id, id) do
          {:ok, _} ->
            # Send Undo { Like } to remote inbox
            remote_entry = Repo.preload(remote_entry, :remote_actor)
            deliver_undo_like(remote_entry, user)

            stamps = Stamps.get_stamp_types_for_remote_entries([id]) |> Map.get(id, [])
            json(conn, %{data: %{stamps: stamps, my_stamp: nil}})

          {:error, :not_found} ->
            conn |> put_status(:not_found) |> json(%{error: "No stamp to remove"})
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # GET /api/remote-entries/:id/comments
  def list_comments(conn, %{"id" => id}) do
    case get_remote_entry(id) do
      {:ok, _remote_entry} ->
        comments =
          Inkwell.Journals.Comment
          |> where([c], c.remote_entry_id == ^id)
          |> order_by(asc: :inserted_at)
          |> preload(:user)
          |> Repo.all()

        json(conn, %{data: Enum.map(comments, &render_comment/1)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # POST /api/remote-entries/:id/comments
  def create_comment(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case get_remote_entry(id) do
      {:ok, remote_entry} ->
        comment_id = Ecto.UUID.generate()
        instance_host = Application.get_env(:inkwell, :federation, []) |> Keyword.get(:instance_host, "inkwell-api.fly.dev")

        attrs = %{
          "id" => comment_id,
          "remote_entry_id" => id,
          "user_id" => user.id,
          "body_html" => params["body_html"],
          "ap_id" => "https://#{instance_host}/comments/#{comment_id}"
        }

        case Journals.create_comment(attrs) do
          {:ok, comment} ->
            # Send Create { Note } reply to remote actor's inbox
            remote_entry = Repo.preload(remote_entry, :remote_actor)
            deliver_reply(remote_entry, comment, user)

            conn |> put_status(:created) |> json(%{data: render_comment(comment)})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Remote entry not found"})
    end
  end

  # ── Activity delivery helpers ──────────────────────────────────────────

  defp deliver_like(remote_entry, user) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_like(remote_entry.ap_id, user, actor.ap_id)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  defp deliver_undo_like(remote_entry, user) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_undo_like(remote_entry.ap_id, user, actor.ap_id)
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  defp deliver_reply(remote_entry, comment, user) do
    actor = remote_entry.remote_actor
    if actor do
      activity = ActivityBuilder.build_reply_note(
        comment.body_html,
        remote_entry.ap_id,
        user,
        comment.id
      )
      inbox = actor.shared_inbox || actor.inbox

      %{activity: activity, inbox_url: inbox, user_id: user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────────

  defp get_remote_entry(id) do
    case RemoteEntries.get_remote_entry(id) do
      nil -> {:error, :not_found}
      entry -> {:ok, entry}
    end
  end

  defp validate_stamp_type(stamp_type) when stamp_type in @valid_stamp_types, do: :ok
  defp validate_stamp_type(_), do: {:error, :invalid_stamp_type}

  defp validate_plus_for_supporter("supporter", user) do
    if user.subscription_tier == "plus", do: :ok, else: {:error, :plus_required}
  end
  defp validate_plus_for_supporter(_, _), do: :ok

  defp render_comment(comment) do
    author =
      if comment.user do
        %{
          id: comment.user.id,
          username: comment.user.username,
          display_name: comment.user.display_name,
          avatar_url: comment.user.avatar_url
        }
      end

    %{
      id: comment.id,
      remote_entry_id: comment.remote_entry_id,
      user_id: comment.user_id,
      body_html: comment.body_html,
      ap_id: comment.ap_id,
      author: author,
      created_at: comment.inserted_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
