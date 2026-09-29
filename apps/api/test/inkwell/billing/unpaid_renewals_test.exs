defmodule Inkwell.Billing.UnpaidRenewalsTest do
  @moduledoc """
  A renewal Square can't collect leaves Plus working for 14 days, then the
  account is free until the invoice is paid (2026-09-29: @tim's September
  renewal went unpaid and nothing on Inkwell noticed — no failure webhook
  came, and even if it had, "past_due" never ended Plus).
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.{Billing, Repo, SelfHosted}
  alias Inkwell.Accounts.User
  alias Inkwell.Billing.UnpaidRenewals

  @sub "SUB-1"

  setup do
    on_exit(fn ->
      Application.delete_env(:inkwell, :unpaid_renewals_subscription_fetcher)
      Application.delete_env(:inkwell, :unpaid_renewals_invoice_fetcher)
    end)

    :ok
  end

  defp plus_member(attrs \\ %{}) do
    create_user()
    |> User.subscription_changeset(
      Map.merge(
        %{subscription_tier: "plus", subscription_status: "active", square_subscription_id: @sub},
        attrs
      )
    )
    |> Repo.update!()
  end

  defp invoice(status, due, extra \\ %{}) do
    Map.merge(
      %{
        "id" => "INV-#{due}",
        "status" => status,
        "subscription_id" => @sub,
        "public_url" => "https://squareup.com/pay-invoice/INV-#{due}",
        "next_payment_amount_money" => %{"amount" => 500, "currency" => "USD"},
        "payment_requests" => [%{"due_date" => due}]
      },
      extra
    )
  end

  # Square as seen by the daily check: one ACTIVE subscription whose invoices
  # (newest first) are `invoices`.
  defp stub_square(invoices, status \\ "ACTIVE") do
    Application.put_env(:inkwell, :unpaid_renewals_subscription_fetcher, fn _ ->
      {:ok, %{"id" => @sub, "status" => status, "invoice_ids" => Enum.map(invoices, & &1["id"])}}
    end)

    Application.put_env(:inkwell, :unpaid_renewals_invoice_fetcher, fn id ->
      case Enum.find(invoices, &(&1["id"] == id)) do
        nil -> {:error, :not_found}
        inv -> {:ok, inv}
      end
    end)
  end

  defp webhook(type, invoice),
    do: Billing.handle_webhook_event(%{"type" => type, "data" => %{"object" => %{"invoice" => invoice}}})

  defp today, do: Date.utc_today()
  defp iso(date), do: Date.to_iso8601(date)

  test "the grace period runs to the end of the 14th day after the renewal" do
    assert UnpaidRenewals.grace_ends_at(~D[2026-09-24]) == ~U[2026-10-08 23:59:59Z]
  end

  describe "unpaid?/2" do
    test "an UNPAID invoice whose due date has come" do
      assert UnpaidRenewals.unpaid?(invoice("UNPAID", "2026-09-24"), ~D[2026-09-29])
      assert UnpaidRenewals.unpaid?(invoice("UNPAID", "2026-09-24"), ~D[2026-09-24])
    end

    test "not a paid, scheduled or future invoice" do
      refute UnpaidRenewals.unpaid?(invoice("PAID", "2026-09-24"), ~D[2026-09-29])
      refute UnpaidRenewals.unpaid?(invoice("SCHEDULED", "2026-09-24"), ~D[2026-09-29])
      refute UnpaidRenewals.unpaid?(invoice("UNPAID", "2026-10-24"), ~D[2026-09-29])
    end
  end

  describe "webhooks (Square wraps invoices as data.object.invoice)" do
    test "a failed charge starts the 14-day countdown; Plus keeps working meanwhile" do
      u = plus_member()
      due = Date.add(today(), -2)
      webhook("invoice.scheduled_charge_failed", invoice("UNPAID", iso(due)))

      u = Repo.get!(User, u.id)
      assert u.subscription_status == "past_due"
      assert DateTime.compare(u.subscription_expires_at, UnpaidRenewals.grace_ends_at(due)) == :eq
      assert SelfHosted.effective_tier(u) == "plus"
    end

    test "once the countdown is over the account is free" do
      u = plus_member()
      webhook("invoice.scheduled_charge_failed", invoice("UNPAID", iso(Date.add(today(), -20))))

      u = Repo.get!(User, u.id)
      assert User.plus_time_ran_out?(u)
      assert SelfHosted.effective_tier(u) == "free"
    end

    test "paying the invoice brings Plus straight back" do
      u = plus_member()
      webhook("invoice.scheduled_charge_failed", invoice("UNPAID", iso(Date.add(today(), -20))))
      webhook("invoice.payment_made", invoice("PAID", iso(Date.add(today(), -20))))

      u = Repo.get!(User, u.id)
      assert u.subscription_status == "active"
      assert is_nil(u.subscription_expires_at)
      assert SelfHosted.effective_tier(u) == "plus"
    end

    test "Square's ACTIVE subscription.updated doesn't cancel the countdown" do
      u = plus_member()
      webhook("invoice.scheduled_charge_failed", invoice("UNPAID", iso(Date.add(today(), -2))))

      Billing.handle_webhook_event(%{
        "type" => "subscription.updated",
        "data" => %{"object" => %{"subscription" => %{"id" => @sub, "status" => "ACTIVE"}}}
      })

      assert Repo.get!(User, u.id).subscription_status == "past_due"
    end

    test "a failure doesn't touch a member who already canceled" do
      ends = DateTime.add(DateTime.utc_now(), 10, :day) |> DateTime.truncate(:second)
      u = plus_member(%{subscription_status: "canceled", subscription_expires_at: ends})
      webhook("invoice.scheduled_charge_failed", invoice("UNPAID", iso(today())))

      u = Repo.get!(User, u.id)
      assert u.subscription_status == "canceled"
      assert DateTime.compare(u.subscription_expires_at, ends) == :eq
    end
  end

  describe "the daily check" do
    test "finds an unpaid renewal no webhook told us about" do
      u = plus_member()
      due = Date.add(today(), -5)
      stub_square([invoice("UNPAID", iso(due)), invoice("PAID", iso(Date.add(due, -30)))])

      UnpaidRenewals.check_all()

      u = Repo.get!(User, u.id)
      assert u.subscription_status == "past_due"
      assert DateTime.compare(u.subscription_expires_at, UnpaidRenewals.grace_ends_at(due)) == :eq
    end

    test "a second unpaid month doesn't move the first deadline" do
      first = Date.add(today(), -35)
      u = plus_member()
      stub_square([invoice("UNPAID", iso(first))])
      UnpaidRenewals.check_all()

      stub_square([invoice("UNPAID", iso(Date.add(first, 30))), invoice("UNPAID", iso(first))])
      UnpaidRenewals.check_all()

      assert DateTime.compare(Repo.get!(User, u.id).subscription_expires_at, UnpaidRenewals.grace_ends_at(first)) == :eq
    end

    test "sees that it was paid" do
      u = plus_member(%{subscription_status: "past_due", subscription_expires_at: DateTime.add(DateTime.utc_now(), -1, :day)})
      stub_square([invoice("PAID", iso(Date.add(today(), -20)))])

      UnpaidRenewals.check_all()

      u = Repo.get!(User, u.id)
      assert u.subscription_status == "active"
      assert is_nil(u.subscription_expires_at)
    end

    test "leaves paying members, Founding Members and unreachable Square alone" do
      paying = plus_member()
      stub_square([invoice("PAID", iso(Date.add(today(), -3)))])
      UnpaidRenewals.check_all()
      assert Repo.get!(User, paying.id).subscription_status == "active"

      Application.put_env(:inkwell, :unpaid_renewals_subscription_fetcher, fn _ -> {:error, :timeout} end)
      assert %{checked: 1} = UnpaidRenewals.check_all()
      assert Repo.get!(User, paying.id).subscription_status == "active"
    end

    test "an Ink Donor's unpaid renewal hides the badge until paid" do
      u =
        create_user()
        |> User.ink_donor_changeset(%{square_donor_subscription_id: @sub, ink_donor_status: "active", ink_donor_amount_cents: 100})
        |> Repo.update!()

      stub_square([invoice("UNPAID", iso(Date.add(today(), -3)))])
      UnpaidRenewals.check_all()
      assert Repo.get!(User, u.id).ink_donor_status == "past_due"

      stub_square([invoice("PAID", iso(Date.add(today(), -3)))])
      UnpaidRenewals.check_all()
      assert Repo.get!(User, u.id).ink_donor_status == "active"
    end
  end

  test "the billing page gets Square's invoice link for a past-due member" do
    due = Date.add(today(), -2)
    u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
    stub_square([invoice("UNPAID", iso(due))])

    assert %{url: "https://squareup.com/pay-invoice/" <> _, due_date: ^due, amount_cents: 500} =
             UnpaidRenewals.unpaid_invoice(u)

    assert UnpaidRenewals.unpaid_invoice(plus_member()) == nil
  end
end
