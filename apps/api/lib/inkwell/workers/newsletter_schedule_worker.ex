defmodule Inkwell.Workers.NewsletterScheduleWorker do
  @moduledoc """
  Oban cron worker that checks for scheduled newsletter sends whose time has arrived.
  Runs every 5 minutes. Finds queued sends with scheduled_at <= now and enqueues
  the delivery worker for each.
  """
  use Oban.Worker, queue: :default, max_attempts: 1

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Newsletter.Send

  @impl Oban.Worker
  def perform(_job) do
    now = DateTime.utc_now()

    sends =
      Send
      |> where([s], s.status == "queued" and not is_nil(s.scheduled_at) and s.scheduled_at <= ^now)
      |> Repo.all()

    Enum.each(sends, fn send ->
      %{send_id: send.id}
      |> Inkwell.Workers.NewsletterDeliveryWorker.new()
      |> Oban.insert()
    end)

    if length(sends) > 0 do
      require Logger
      Logger.info("Triggered #{length(sends)} scheduled newsletter sends")
    end

    :ok
  end
end
