defmodule InkwellWeb.StampController do
  use InkwellWeb, :controller

  alias Inkwell.{Journals, Stamps, Accounts}

  @valid_stamp_types ~w(felt holding_space beautifully_said rooting throwback i_cannot supporter)

  # POST /api/entries/:entry_id/stamp
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user
    stamp_type = params["stamp_type"]

    with :ok <- validate_stamp_type(stamp_type),
         :ok <- validate_plus_for_supporter(stamp_type, user),
         {:ok, entry} <- get_entry(entry_id),
         :ok <- validate_not_own_entry(entry, user) do
      case Stamps.stamp_entry(user.id, entry_id, stamp_type) do
        {:ok, stamp, action} ->
          # Create notification for entry author only on new stamps
          if action == :created do
            Accounts.create_notification(%{
              type: :stamp,
              user_id: entry.user_id,
              actor_id: user.id,
              target_type: "entry",
              target_id: entry.id,
              data: %{stamp_type: stamp_type}
            })
          end

          stamp_types = Stamps.get_entry_stamp_types(entry_id)

          json(conn, %{data: %{
            stamp_type: Atom.to_string(stamp.stamp_type),
            stamps: stamp_types
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

      {:error, :own_entry} ->
        conn |> put_status(:forbidden) |> json(%{error: "Cannot stamp your own entry"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # DELETE /api/entries/:entry_id/stamp
  def delete(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user

    case Stamps.remove_stamp(user.id, entry_id) do
      {:ok, _} ->
        stamp_types = Stamps.get_entry_stamp_types(entry_id)
        json(conn, %{data: %{stamps: stamp_types, my_stamp: nil}})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "No stamp to remove"})
    end
  end

  # GET /api/entries/:entry_id/stamps
  def index(conn, %{"entry_id" => entry_id}) do
    viewer = conn.assigns[:current_user]

    case get_entry(entry_id) do
      {:ok, entry} ->
        stamp_types = Stamps.get_entry_stamp_types(entry_id)
        my_stamp = if viewer, do: Stamps.get_user_stamp(viewer.id, entry_id), else: nil

        result = %{
          stamps: stamp_types,
          my_stamp: if(my_stamp, do: Atom.to_string(my_stamp.stamp_type), else: nil)
        }

        # If viewer is the author, include who left each stamp
        result =
          if viewer && viewer.id == entry.user_id do
            details = Stamps.get_entry_stamps_detail(entry_id)

            by_type =
              details
              |> Enum.group_by(
                fn s -> Atom.to_string(s.stamp_type) end,
                fn s ->
                  %{
                    id: s.user.id,
                    username: s.user.username,
                    display_name: s.user.display_name,
                    avatar_url: s.user.avatar_url
                  }
                end
              )

            Map.put(result, :stamped_by, by_type)
          else
            result
          end

        json(conn, %{data: result})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp validate_stamp_type(stamp_type) when stamp_type in @valid_stamp_types, do: :ok
  defp validate_stamp_type(_), do: {:error, :invalid_stamp_type}

  defp validate_plus_for_supporter("supporter", user) do
    if user.subscription_tier == "plus", do: :ok, else: {:error, :plus_required}
  end

  defp validate_plus_for_supporter(_, _), do: :ok

  defp validate_not_own_entry(entry, user) do
    if entry.user_id == user.id, do: {:error, :own_entry}, else: :ok
  end

  defp get_entry(entry_id) do
    {:ok, Journals.get_entry!(entry_id)}
  rescue
    Ecto.NoResultsError -> {:error, :not_found}
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
