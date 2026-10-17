defmodule InkwellWeb.StampController do
  use InkwellWeb, :controller

  alias Inkwell.{Journals, Social, Stamps, Accounts, SelfHosted}
  alias Inkwell.Stamps.Stamp
  alias InkwellWeb.StampJSON

  # POST /api/entries/:entry_id/stamp  {stamp_type, note?}
  def create(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user
    stamp_type = params["stamp_type"]

    with :ok <- validate_stamp_type(stamp_type),
         :ok <- validate_plus_sheet(stamp_type, user),
         {:ok, entry} <- get_viewable_entry(entry_id, user),
         :ok <- validate_not_own_entry(entry, user),
         :ok <- validate_not_blocked(entry, user) do
      attrs = stamp_attrs(stamp_type, params)

      case Stamps.stamp_entry(user.id, entry.id, attrs) do
        {:ok, stamp, action, _previous} ->
          if action == :created, do: notify_writer(entry, user, stamp)

          json(conn, %{
            data:
              Map.merge(Stamps.entry_fields(entry.id), %{
                stamp_type: Atom.to_string(stamp.stamp_type),
                note: stamp.note,
                my_stamp: Atom.to_string(stamp.stamp_type),
                my_note: stamp.note,
                my_stamped_on: Stamps.mark(stamp).stamped_on
              })
          })

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: first_error(changeset), errors: format_errors(changeset)})
      end
    else
      error -> render_error(conn, error)
    end
  end

  # DELETE /api/entries/:entry_id/stamp
  def delete(conn, %{"entry_id" => entry_id}) do
    user = conn.assigns.current_user

    with {:ok, _uuid} <- Ecto.UUID.cast(entry_id),
         {:ok, _} <- Stamps.remove_stamp(user.id, entry_id) do
      json(conn, %{data: Map.merge(Stamps.entry_fields(entry_id), %{my_stamp: nil, my_note: nil, my_stamped_on: nil})})
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "No stamp to take back"})
    end
  end

  # GET /api/entries/:entry_id/stamps
  def index(conn, %{"entry_id" => entry_id}) do
    viewer = conn.assigns[:current_user]

    case get_viewable_entry(entry_id, viewer) do
      {:ok, entry} ->
        mine = if viewer, do: Stamps.get_user_stamp(viewer.id, entry.id)

        result =
          entry.id
          |> Stamps.entry_fields()
          |> Map.merge(my_fields(mine))

        # The writer sees who sent each stamp, and the notes.
        result =
          if viewer && viewer.id == entry.user_id do
            blocked = Social.get_blocked_user_ids(viewer.id)

            letters =
              entry.id
              |> Stamps.letters_for_entry()
              |> Enum.reject(&(&1.user_id && &1.user_id in blocked))
              |> Enum.map(&StampJSON.letter/1)

            Map.put(result, :letters, letters)
          else
            result
          end

        json(conn, %{data: result})

      _ ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # GET /api/me/stamps?box=received|sent&page=&per_page=&type=
  def album(conn, params) do
    user = conn.assigns.current_user
    box = if params["box"] == "sent", do: :sent, else: :received
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 30) |> min(60) |> max(1)

    {stamps, total, types} =
      Stamps.album(user.id, box,
        page: page,
        per_page: per_page,
        type: params["type"],
        exclude_user_ids: Social.get_blocked_user_ids(user.id)
      )

    json(conn, %{
      data: Enum.map(stamps, &StampJSON.album_item/1),
      meta: %{
        box: Atom.to_string(box),
        page: page,
        per_page: per_page,
        total: total,
        total_pages: max(1, div(total + per_page - 1, per_page)),
        types: types
      }
    })
  end

  # ── Shared with RemoteEntryController ───────────────────────────────────

  @doc false
  def my_fields(nil), do: %{my_stamp: nil, my_note: nil, my_stamped_on: nil}

  def my_fields(%Stamp{} = s),
    do: %{my_stamp: Atom.to_string(s.stamp_type), my_note: s.note, my_stamped_on: Stamps.mark(s).stamped_on}

  @doc false
  def stamp_attrs(stamp_type, params) do
    attrs = %{stamp_type: stamp_type}
    if Map.has_key?(params, "note"), do: Map.put(attrs, :note, params["note"]), else: attrs
  end

  @doc false
  def validate_stamp_type(type) when is_binary(type) do
    cond do
      type in Stamp.pickable() -> :ok
      type in Stamp.retired() -> {:error, :retired}
      true -> {:error, :invalid_stamp_type}
    end
  end

  def validate_stamp_type(_), do: {:error, :invalid_stamp_type}

  @doc false
  def validate_plus_sheet(type, user) do
    if type in Stamp.keepsakes() and SelfHosted.effective_tier(user) != "plus",
      do: {:error, :plus_required},
      else: :ok
  end

  @doc false
  def render_error(conn, {:error, :invalid_stamp_type}),
    do: conn |> put_status(:bad_request) |> json(%{error: "That isn't a stamp we print."})

  def render_error(conn, {:error, :retired}),
    do:
      conn
      |> put_status(:bad_request)
      |> json(%{error: "That stamp has been retired. Stamps already sent keep showing.", code: "retired"})

  def render_error(conn, {:error, :plus_required}),
    do:
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Keepsakes are a sheet for Plus members.", code: "plus_required"})

  def render_error(conn, {:error, :own_entry}),
    do: conn |> put_status(:forbidden) |> json(%{error: "You can't stamp your own entry."})

  def render_error(conn, {:error, :blocked}),
    do: conn |> put_status(:forbidden) |> json(%{error: "You can't stamp this entry."})

  def render_error(conn, _),
    do: conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

  @doc false
  def first_error(changeset) do
    case Ecto.Changeset.traverse_errors(changeset, fn {msg, _} -> msg end) do
      %{note: _} -> "Notes can be up to #{Stamp.note_max()} characters."
      _ -> "Couldn't send that stamp."
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp notify_writer(entry, sender, stamp) do
    Accounts.create_notification(%{
      type: :stamp,
      user_id: entry.user_id,
      actor_id: sender.id,
      target_type: "entry",
      target_id: entry.id,
      data: %{
        stamp_type: Atom.to_string(stamp.stamp_type),
        note: stamp.note,
        entry_title: entry.title
      }
    })
  end

  defp validate_not_own_entry(entry, user) do
    if entry.user_id == user.id, do: {:error, :own_entry}, else: :ok
  end

  defp validate_not_blocked(entry, user) do
    if Social.is_blocked_between?(user.id, entry.user_id), do: {:error, :blocked}, else: :ok
  end

  # Only entries the viewer can read can be stamped or looked at; anything
  # else is "not found" so private entries can't be probed by id.
  defp get_viewable_entry(entry_id, viewer) do
    with {:ok, uuid} <- Ecto.UUID.cast(entry_id),
         %{} = entry <- Journals.get_entry(uuid),
         true <- Journals.viewable_by?(entry, viewer) do
      {:ok, entry}
    else
      _ -> {:error, :not_found}
    end
  end

  defp parse_int(nil, default), do: default

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} when n > 0 -> n
      _ -> default
    end
  end

  defp parse_int(v, _default) when is_integer(v) and v > 0, do: v
  defp parse_int(_, default), do: default

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
