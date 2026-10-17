defmodule Inkwell.Federation.RemoteAuthors do
  @moduledoc """
  Keeps fediverse authors' pictures current on things they wrote here.

  A guestbook signature or footnote from the fediverse stores a copy of its
  author (`remote_author`, with `avatar_url`) taken when it arrived. People
  change their picture, and servers delete the old file, so that copy goes
  stale: the old address answers 404 (or 401 once a server moves its files)
  and the picture breaks. Rendering asks the cached actor
  (`remote_actors`, which the inbox keeps current) for the picture instead,
  and refreshes actors whose cache is old in the background so the next view
  has the new one.

  Tests set `config :inkwell, :refresh_remote_authors, false` so nothing goes
  to the network.
  """

  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Federation.{Background, RemoteActor, RemoteActorSchema}

  # Re-fetch an actor shown here once its cache is older than this.
  @stale_after_seconds 86_400
  # At most this many background refreshes per page view.
  @max_refreshes 5

  @doc """
  Returns `records` (anything with a `remote_author` map) with each fediverse
  author's `avatar_url` replaced by their current one, when we have it.
  """
  def with_current_avatars(records) when is_list(records) do
    ap_ids =
      records
      |> Enum.map(&ap_id_of/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    if ap_ids == [] do
      records
    else
      actors =
        from(a in RemoteActorSchema,
          where: a.ap_id in ^ap_ids,
          select: {a.ap_id, a.avatar_url, a.updated_at}
        )
        |> Repo.all()

      refresh_stale(ap_ids, actors)

      current =
        for {ap_id, url, _} <- actors, is_binary(url) and url != "", into: %{}, do: {ap_id, url}

      Enum.map(records, fn record ->
        case current[ap_id_of(record)] do
          nil -> record
          url -> %{record | remote_author: put_avatar(record.remote_author, url)}
        end
      end)
    end
  end

  defp ap_id_of(%{remote_author: %{} = ra}) do
    case ra["ap_id"] || ra[:ap_id] do
      "https://" <> _ = ap_id -> ap_id
      _ -> nil
    end
  end

  defp ap_id_of(_), do: nil

  defp put_avatar(ra, url) do
    if Map.has_key?(ra, :avatar_url), do: Map.put(ra, :avatar_url, url), else: Map.put(ra, "avatar_url", url)
  end

  defp refresh_stale(ap_ids, actors) do
    if Application.get_env(:inkwell, :refresh_remote_authors, true) do
      now = DateTime.utc_now()
      known = Map.new(actors, fn {ap_id, _, updated_at} -> {ap_id, updated_at} end)

      due =
        ap_ids
        |> Enum.filter(fn ap_id ->
          case known[ap_id] do
            nil -> true
            updated_at -> DateTime.diff(now, updated_at, :second) > @stale_after_seconds
          end
        end)
        |> Enum.take(@max_refreshes)

      if due != [] do
        Background.run(fn -> Enum.each(due, &RemoteActor.fetch/1) end)
      end
    end

    :ok
  end
end
