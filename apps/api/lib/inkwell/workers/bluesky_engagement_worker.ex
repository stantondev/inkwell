defmodule Inkwell.Workers.BlueskyEngagementWorker do
  @moduledoc """
  Brings back replies, likes and reposts for entries shared to Bluesky
  (`Inkwell.Bluesky.Engagement`).

    * `%{"entry_id" => id}`: one entry, queued when someone opens its
      footnotes and a share is due a look;
    * no args (cron, every 15 minutes): every share from the last 30 days
      that is due, oldest look first, at most 60 per run.
  """

  use Oban.Worker, queue: :federation, max_attempts: 2, unique: [period: 120, fields: [:worker, :args]]

  alias Inkwell.Bluesky.Engagement

  @per_run 60

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(5)

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"entry_id" => entry_id}}) do
    Engagement.refresh(entry_id)
  end

  def perform(%Oban.Job{}) do
    Engagement.recent_shared_entry_ids()
    |> Enum.map(&Inkwell.Repo.get(Inkwell.Journals.Entry, &1))
    |> Enum.filter(&(&1 && Engagement.due?(&1)))
    |> Enum.take(@per_run)
    |> Enum.each(&Engagement.refresh(&1.id))

    :ok
  end

  @doc "Queue a look at `entry` if one of its Bluesky shares is due (cheap no-op otherwise)."
  def maybe_enqueue(entry) do
    if Engagement.due?(entry) do
      %{entry_id: entry.id} |> new() |> Oban.insert()
    end

    :ok
  end
end
