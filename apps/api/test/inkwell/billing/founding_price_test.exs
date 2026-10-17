defmodule Inkwell.Billing.FoundingPriceTest do
  @moduledoc """
  The Founding price rises on a set date without touching anyone who already
  bought, and the money raised is what people actually paid.
  """
  use Inkwell.DataCase, async: false

  alias Inkwell.Billing.Founding
  alias Inkwell.Repo

  @rise ~U[2026-11-01 04:00:00Z]

  setup do
    previous = Application.get_env(:inkwell, :founding_price_steps)
    Application.put_env(:inkwell, :founding_price_steps, [{@rise, 14900}])

    on_exit(fn ->
      if previous,
        do: Application.put_env(:inkwell, :founding_price_steps, previous),
        else: Application.delete_env(:inkwell, :founding_price_steps)
    end)
  end

  test "$99 until the end of October 31 Eastern, $149 after" do
    assert Founding.price_cents(~U[2026-10-31 12:00:00Z]) == 9900
    # 11:59pm Eastern on Oct 31 is 03:59 UTC on Nov 1.
    assert Founding.price_cents(~U[2026-11-01 03:59:59Z]) == 9900
    assert Founding.price_cents(@rise) == 14900
    assert Founding.price_cents(~U[2027-03-01 00:00:00Z]) == 14900
  end

  test "next_price_change names the rise until it happens" do
    assert Founding.next_price_change(~U[2026-10-20 00:00:00Z]) == {@rise, 14900}
    assert Founding.next_price_change(~U[2026-11-02 00:00:00Z]) == nil
  end

  test "a payment at either price is recognised" do
    assert 9900 in Founding.known_prices()
    assert 14900 in Founding.known_prices()
  end

  test "raised_cents adds up what each member actually paid" do
    {:ok, a, :granted} = Founding.grant(create_user(), "pay_a", 9900)
    {:ok, _b, :granted} = Founding.grant(create_user(), "pay_b", 14900)

    assert Repo.reload!(a).founding_member_paid_cents == 9900
    assert Founding.raised_cents() == 24_800
    assert Founding.status().raised_cents == 24_800
  end

  test "a member from before the column existed counts as $99" do
    {:ok, a, :granted} = Founding.grant(create_user(), "pay_old", 9900)
    a |> Ecto.Changeset.change(founding_member_paid_cents: nil) |> Repo.update!()

    assert Founding.raised_cents() == 9900
  end

  test "transparency counts Founding Members as paying members" do
    Inkwell.Transparency.clear_cache()
    {:ok, _, :granted} = Founding.grant(create_user(), "pay_t", 9900)
    stats = Inkwell.Transparency.stats()

    assert stats.paying_members == stats.monthly_paying_members + 1
    assert stats.founding.raised_cents == 9900
  after
    Inkwell.Transparency.clear_cache()
  end

  test "transparency leaves spam-limited accounts out of its counts" do
    Inkwell.Transparency.clear_cache()
    before = Inkwell.Transparency.stats().users.total
    create_user() |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()

    assert Inkwell.Transparency.stats().users.total == before
  after
    Inkwell.Transparency.clear_cache()
  end
end
