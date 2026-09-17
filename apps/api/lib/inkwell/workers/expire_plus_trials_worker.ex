defmodule Inkwell.Workers.ExpirePlusTrialsWorker do
  @moduledoc "Hourly: end free Plus trials whose 14 days are up."

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    Inkwell.Billing.Trials.expire_due()
    :ok
  end
end
