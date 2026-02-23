defmodule Inkwell.Federation.RemoteEntries do
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteEntry

  def upsert_remote_entry(attrs) do
    case Repo.get_by(RemoteEntry, ap_id: attrs.ap_id) do
      nil ->
        %RemoteEntry{}
        |> RemoteEntry.changeset(attrs)
        |> Repo.insert()

      existing ->
        existing
        |> RemoteEntry.changeset(attrs)
        |> Repo.update()
    end
  end

  def get_remote_entry!(id), do: Repo.get!(RemoteEntry, id)

  def get_remote_entry(id), do: Repo.get(RemoteEntry, id)

  def delete_by_ap_id(ap_id) do
    case Repo.get_by(RemoteEntry, ap_id: ap_id) do
      nil -> {:ok, nil}
      entry -> Repo.delete(entry)
    end
  end

  def list_public_remote_entries(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    RemoteEntry
    |> where([e], not is_nil(e.published_at))
    |> order_by(desc: :published_at)
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> preload(:remote_actor)
    |> Repo.all()
  end

  def cleanup_old_entries(days \\ 90) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      RemoteEntry
      |> where([e], e.inserted_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end
end
