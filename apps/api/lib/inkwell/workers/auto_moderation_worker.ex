defmodule Inkwell.Workers.AutoModerationWorker do
  @moduledoc """
  Runs automated spam moderation.

    * `%{"scope" => "recent"}` — hourly
    * `%{"scope" => "all"}` — daily sweep
    * `%{"scope" => "digest"}` — daily Slack summary
    * `%{"scope" => "user", "user_id" => id}` — on a new report or a new
      account publishing (unique per user for 10 minutes)
  """
  use Oban.Worker,
    queue: :default,
    max_attempts: 2,
    unique: [period: 600, keys: [:scope, :user_id], states: [:available, :scheduled, :executing]]

  alias Inkwell.Moderation.AutoModeration

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"scope" => "user", "user_id" => id}}) do
    AutoModeration.scan_user(id)
    :ok
  end

  def perform(%Oban.Job{args: %{"scope" => "recent"}}) do
    AutoModeration.scan_recent()
    :ok
  end

  def perform(%Oban.Job{args: %{"scope" => "all"}}) do
    AutoModeration.scan_all()
    :ok
  end

  def perform(%Oban.Job{args: %{"scope" => "digest"}}) do
    AutoModeration.daily_digest()
    :ok
  end

  @doc "Queue a scan of one account shortly (lets a burst of posts settle)."
  def enqueue_user(user_id) do
    %{"scope" => "user", "user_id" => user_id}
    |> new(schedule_in: 60)
    |> Oban.insert()
  end
end
