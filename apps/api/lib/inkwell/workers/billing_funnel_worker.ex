defmodule Inkwell.Workers.BillingFunnelWorker do
  @moduledoc """
  Weekly: alert if people are starting checkouts and none of them completes.

  Runs weekly rather than daily on purpose — the signal covers a fortnight,
  so a daily job would just repeat the same alert every morning.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  @impl Oban.Worker
  def perform(_job) do
    Inkwell.Billing.Funnel.check_and_alert()
    :ok
  end
end
