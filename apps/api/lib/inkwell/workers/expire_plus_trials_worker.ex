defmodule Inkwell.Workers.ExpirePlusTrialsWorker do
  @moduledoc "Hourly: remind trials ending within two days, then end the ones whose 14 days are up."

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    Inkwell.Billing.Trials.send_due_reminders()
    Inkwell.Billing.Trials.expire_due()
    :ok
  end
end
