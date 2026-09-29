defmodule Inkwell.Workers.UnpaidRenewalsWorker do
  @moduledoc """
  Daily: ask Square whether every paying member's latest renewal was paid
  (`Inkwell.Billing.UnpaidRenewals.check_all/0`). Runs an hour after Square
  charges renewals (~17:00 UTC), so a card that failed that day is caught.
  """

  use Oban.Worker, queue: :default, max_attempts: 3, unique: [period: 3600]

  @impl Oban.Worker
  def perform(_job) do
    Inkwell.Billing.UnpaidRenewals.check_all()
    :ok
  end
end
