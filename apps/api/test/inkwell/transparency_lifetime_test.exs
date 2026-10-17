defmodule Inkwell.TransparencyLifetimeTest do
  use Inkwell.DataCase, async: false

  alias Inkwell.Transparency

  test "cost_between carries each monthly bill until the next one starts" do
    history = [{~D[2026-01-01], 1200}, {~D[2026-07-01], 2400}]

    # Half a year at $12 and half a year at $24 is about $108.
    total = Transparency.cost_between(history, ~D[2026-01-01], ~D[2027-01-01])
    assert_in_delta total, 6 * 1200 + 6 * 2400, 120

    # Nothing before the start date or after "today" counts.
    assert Transparency.cost_between(history, ~D[2026-07-01], ~D[2026-07-01]) == 0
    assert_in_delta Transparency.cost_between(history, ~D[2026-08-01], ~D[2026-09-01]), 2400, 60
  end

  test "net_cents takes off refunds and Square's fee" do
    payment = %{
      "amount_money" => %{"amount" => 9900},
      "refunded_money" => %{"amount" => 0},
      "processing_fee" => [%{"amount_money" => %{"amount" => 317}}]
    }

    assert Transparency.net_cents(payment) == 9583
    assert Transparency.net_cents(%{"amount_money" => %{"amount" => 500}, "refunded_money" => %{"amount" => 500}}) == 0
  end

  test "lifetime reports days, an estimated cost, and no paid number without Square" do
    Transparency.clear_cache()
    life = Transparency.lifetime(~D[2026-10-17])

    assert life.days == Date.diff(~D[2026-10-17], life.started_on)
    assert life.cost_cents > 0
    assert life.cost_estimated
    assert life.paid_cents == nil
    assert life.behind_cents == nil
  after
    Transparency.clear_cache()
  end
end
