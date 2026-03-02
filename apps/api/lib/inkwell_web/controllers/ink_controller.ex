defmodule InkwellWeb.InkController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Inks, Journals, Social}
  alias Inkwell.Federation.Workers.FanOutWorker

  # POST /api/entries/:entry_id/ink — toggle ink on/off
  def toggle(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user

    with {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_not_own_entry(entry, user),
         :ok <- validate_not_blocked(entry, user) do
      case Inks.toggle_ink(user.id, entry_id) do
        {:ok, {:created, _ink}} ->
          Accounts.create_notification(%{
            type: :ink,
            user_id: entry.user_id,
            actor_id: user.id,
            target_type: "entry",
            target_id: entry.id
          })

          # Send Announce (boost) to inker's fediverse followers for public entries
          if entry.privacy == :public do
            %{entry_id: entry_id, action: "announce", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          updated = Journals.get_entry!(entry_id)
          json(conn, %{data: %{inked: true, ink_count: updated.ink_count}})

        {:ok, {:removed, _}} ->
          # Send Undo { Announce } to inker's fediverse followers for public entries
          if entry.privacy == :public do
            %{entry_id: entry_id, action: "undo_announce", user_id: user.id}
            |> FanOutWorker.new()
            |> Oban.insert()
          end

          updated = Journals.get_entry!(entry_id)
          json(conn, %{data: %{inked: false, ink_count: updated.ink_count}})

        {:error, _changeset} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to process ink"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

      {:error, :own_entry} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot ink your own entry"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot ink this entry"})
    end
  end

  defp get_entry(entry_id) do
    {:ok, Journals.get_entry!(entry_id)}
  rescue
    Ecto.NoResultsError -> {:error, :not_found}
  end

  defp validate_not_own_entry(entry, user) do
    if entry.user_id == user.id, do: {:error, :own_entry}, else: :ok
  end

  defp validate_not_blocked(entry, user) do
    if Social.is_blocked_between?(user.id, entry.user_id), do: {:error, :blocked}, else: :ok
  end
end
