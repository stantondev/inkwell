defmodule Inkwell.Stamps do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Stamps.Stamp

  @doc """
  Create or update a stamp on an entry.
  If the user already stamped this entry, updates the stamp_type.
  Returns {:ok, stamp, :created} for new stamps, {:ok, stamp, :updated} for changes.
  """
  def stamp_entry(user_id, entry_id, stamp_type) do
    case Repo.get_by(Stamp, user_id: user_id, entry_id: entry_id) do
      nil ->
        case %Stamp{}
             |> Stamp.changeset(%{user_id: user_id, entry_id: entry_id, stamp_type: stamp_type})
             |> Repo.insert() do
          {:ok, stamp} -> {:ok, stamp, :created}
          {:error, changeset} -> {:error, changeset}
        end

      existing ->
        case existing
             |> Stamp.changeset(%{stamp_type: stamp_type})
             |> Repo.update() do
          {:ok, stamp} -> {:ok, stamp, :updated}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Remove a user's stamp from an entry.
  """
  def remove_stamp(user_id, entry_id) do
    case Repo.get_by(Stamp, user_id: user_id, entry_id: entry_id) do
      nil -> {:error, :not_found}
      stamp -> Repo.delete(stamp)
    end
  end

  @doc """
  Get the distinct stamp types present on an entry (no counts).
  """
  def get_entry_stamp_types(entry_id) do
    Stamp
    |> where(entry_id: ^entry_id)
    |> select([s], s.stamp_type)
    |> distinct(true)
    |> Repo.all()
    |> Enum.map(&Atom.to_string/1)
  end

  @doc """
  Get the current user's stamp on an entry, if any.
  """
  def get_user_stamp(user_id, entry_id) do
    Stamp
    |> where(user_id: ^user_id, entry_id: ^entry_id)
    |> Repo.one()
  end

  @doc """
  Get stamp details for an entry — used by the author to see who stamped.
  Returns stamps grouped by type with user info.
  """
  def get_entry_stamps_detail(entry_id) do
    Stamp
    |> where(entry_id: ^entry_id)
    |> preload(:user)
    |> Repo.all()
  end

  @doc """
  Get stamp types for a list of entry IDs (batch query for feed).
  Returns a map of entry_id => [stamp_type_strings].
  """
  def get_stamp_types_for_entries(entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      %{}
    else
      Stamp
      |> where([s], s.entry_id in ^entry_ids)
      |> select([s], {s.entry_id, s.stamp_type})
      |> distinct(true)
      |> Repo.all()
      |> Enum.group_by(fn {entry_id, _} -> entry_id end, fn {_, stamp_type} -> Atom.to_string(stamp_type) end)
    end
  end

  @doc """
  Get the current user's stamps across multiple entries (batch query for feed).
  Returns a map of entry_id => stamp_type_string.
  """
  def get_user_stamps_for_entries(user_id, entry_ids) when is_list(entry_ids) do
    if entry_ids == [] do
      %{}
    else
      Stamp
      |> where([s], s.user_id == ^user_id and s.entry_id in ^entry_ids)
      |> select([s], {s.entry_id, s.stamp_type})
      |> Repo.all()
      |> Map.new(fn {entry_id, stamp_type} -> {entry_id, Atom.to_string(stamp_type)} end)
    end
  end
end
