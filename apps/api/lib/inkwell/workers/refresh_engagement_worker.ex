defmodule Inkwell.Workers.RefreshEngagementWorker do
  @moduledoc """
  Re-reads replies/boosts/favourites of fediverse posts from their home
  servers (`Inkwell.Federation.Engagement`).

  - `%{}` (cron, every 15 minutes): posts from accounts members follow (the
    Feed), up to 3 days old, whose counts are stale for their age.
  - `%{"ids" => [...]}`: posts that were just on someone's screen.
  - `%{"id" => id, "force" => true}`: a minute after a member stamped or
    reprinted the post.

  Until 2026-09-25 this ran every 6 hours for 100 random posts out of ~900 a
  week, so almost every post showed 0.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 1,
    unique: [period: 300, keys: [:ids, :id]]

  import Ecto.Query

  alias Inkwell.Federation.{Engagement, RemoteEntry}
  alias Inkwell.Repo

  require Logger

  @scheduled_window_days 3
  @scheduled_limit 150
  # Same-server requests are spaced out; Mastodon allows 300 a 5 minutes.
  @same_server_delay_ms 500

  # Bounded so a stalled remote can't hold this federation slot indefinitely.
  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(10)

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"id" => id} = args}) do
    case Repo.get(RemoteEntry, id) do
      nil -> :ok
      entry -> Engagement.refresh(entry, force: args["force"] == true)
    end

    :ok
  end

  def perform(%Oban.Job{args: %{"ids" => ids}}) when is_list(ids) do
    from(e in RemoteEntry, where: e.id in ^Enum.take(ids, 100))
    |> Repo.all()
    |> refresh_all()

    :ok
  end

  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()
    since = DateTime.add(now, -@scheduled_window_days, :day)

    entries =
      from(e in RemoteEntry,
        where: is_nil(e.source) and e.published_at > ^since,
        order_by: [desc: e.published_at],
        limit: 1000
      )
      |> Repo.all()
      |> Enum.filter(&Engagement.stale?(&1, now))
      |> Enum.take(@scheduled_limit)

    if entries != [] do
      results = refresh_all(entries)
      Logger.info("RefreshEngagementWorker: #{inspect(results)}")
    end

    :ok
  end

  defp refresh_all(entries) do
    entries
    |> Enum.group_by(&host/1)
    |> Enum.flat_map(fn {_host, same_host} ->
      same_host
      |> Enum.with_index()
      |> Enum.map(fn {entry, i} ->
        if i > 0, do: Process.sleep(@same_server_delay_ms)
        Engagement.refresh(entry)
      end)
    end)
    |> Enum.frequencies()
  end

  defp host(%RemoteEntry{ap_id: ap_id}) do
    case URI.parse(ap_id || "") do
      %URI{host: host} when is_binary(host) -> host
      _ -> "unknown"
    end
  end
end
