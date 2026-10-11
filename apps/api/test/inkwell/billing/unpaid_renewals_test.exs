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
    # Closing a subscription goes to Square; record the calls instead.
    test_pid = self()

    Application.put_env(:inkwell, :unpaid_renewals_subscription_canceler, fn id ->
      send(test_pid, {:canceled_subscription, id})
      {:ok, %{"id" => id, "status" => "ACTIVE", "canceled_date" => iso(Date.add(today(), 10))}}
    end)

    Application.put_env(:inkwell, :unpaid_renewals_invoice_canceler, fn inv ->
      send(test_pid, {:canceled_invoice, inv["id"]})
      {:ok, Map.put(inv, "status", "CANCELED")}
    end)

    on_exit(fn ->
      Application.delete_env(:inkwell, :unpaid_renewals_subscription_canceler)
      Application.delete_env(:inkwell, :unpaid_renewals_invoice_canceler)
      Application.delete_env(:inkwell, :unpaid_renewals_subscription_fetcher)
      Application.delete_env(:inkwell, :unpaid_renewals_invoice_fetcher)
      Application.delete_env(:inkwell, :admin_overview_subscription_fetcher)
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
        "version" => 3,
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

    assert %{state: :unpaid, url: "https://squareup.com/pay-invoice/" <> _, due_date: ^due, amount_cents: 500} =
             UnpaidRenewals.renewal_invoice(u)

    assert UnpaidRenewals.renewal_invoice(plus_member()) == nil
  end

  describe "closing an unpaid subscription when the grace ends" do
    # 2026-10-11, Stanton: "If they don't pay, the invoice and subscription
    # should be canceled. I don't want to be going in and doing this." Until
    # then a member who never paid stayed on a live Square subscription that
    # kept invoicing (and, with a card on file, charging) every month.

    test "inside the grace nothing is closed" do
      due = Date.add(today(), -5)
      u = plus_member()
      stub_square([invoice("UNPAID", iso(due))])

      assert UnpaidRenewals.check_plus(u) == :unpaid
      refute_received {:canceled_subscription, _}
      assert Repo.get!(User, u.id).subscription_tier == "plus"
    end

    test "after the grace: Square subscription and invoice canceled, account free" do
      due = Date.add(today(), -16)
      u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
      stub_square([invoice("UNPAID", iso(due))])

      assert UnpaidRenewals.check_plus(u) == :closed
      assert_received {:canceled_subscription, @sub}
      inv_id = "INV-#{iso(due)}"
      assert_received {:canceled_invoice, ^inv_id}

      u = Repo.get!(User, u.id)
      assert u.subscription_tier == "free"
      assert u.subscription_status == "canceled"
      # Coming back is an ordinary checkout, straight away.
      assert Billing.plus_checkout_state(u) == :allowed
    end

    test "a long-overdue renewal found for the first time is marked and closed in one run" do
      due = Date.add(today(), -40)
      u = plus_member()
      stub_square([invoice("UNPAID", iso(due))])

      UnpaidRenewals.check_all()

      assert_received {:canceled_subscription, @sub}
      assert Repo.get!(User, u.id).subscription_tier == "free"
    end

    test "if Square refuses the cancel, nothing changes and tomorrow tries again" do
      due = Date.add(today(), -16)
      u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
      stub_square([invoice("UNPAID", iso(due))])
      Application.put_env(:inkwell, :unpaid_renewals_subscription_canceler, fn _ -> {:error, :timeout} end)

      assert UnpaidRenewals.check_plus(u) == :error
      refute_received {:canceled_invoice, _}
      u = Repo.get!(User, u.id)
      assert u.subscription_tier == "plus"
      assert u.subscription_status == "past_due"
    end

    test "Square's update for the closed subscription doesn't put Plus back" do
      due = Date.add(today(), -16)
      u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
      stub_square([invoice("UNPAID", iso(due))])
      assert UnpaidRenewals.check_plus(u) == :closed

      for status <- ["ACTIVE", "CANCELED"] do
        Billing.handle_webhook_event(%{
          "type" => "subscription.updated",
          "data" => %{
            "object" => %{
              "subscription" => %{
                "id" => @sub,
                "customer_id" => "CUST-none",
                "status" => status,
                "canceled_date" => iso(Date.add(today(), 10))
              }
            }
          }
        })

        u = Repo.get!(User, u.id)
        assert u.subscription_tier == "free"
        assert u.subscription_status == "canceled"
      end
    end

    test "a paid-up member's scheduled cancel still keeps Plus until its date" do
      u = plus_member()

      Billing.handle_webhook_event(%{
        "type" => "subscription.updated",
        "data" => %{
          "object" => %{
            "subscription" => %{
              "id" => @sub,
              "customer_id" => "CUST-none",
              "status" => "ACTIVE",
              "canceled_date" => iso(Date.add(today(), 10))
            }
          }
        }
      })

      u = Repo.get!(User, u.id)
      assert u.subscription_tier == "plus"
      assert u.subscription_status == "canceled"
      assert Billing.plus_checkout_state(u) == :cancel_scheduled
    end

    test "a subscription already canceled in Square is just ended here" do
      due = Date.add(today(), -16)
      u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
      stub_square([invoice("UNPAID", iso(due))], "CANCELED")

      assert UnpaidRenewals.check_plus(u) == :closed
      refute_received {:canceled_subscription, _}
      assert Repo.get!(User, u.id).subscription_tier == "free"
    end

    test "paying members are never touched" do
      u = plus_member()
      stub_square([invoice("PAID", iso(Date.add(today(), -40)))])

      UnpaidRenewals.check_all()

      refute_received {:canceled_subscription, _}
      u = Repo.get!(User, u.id)
      assert {u.subscription_tier, u.subscription_status} == {"plus", "active"}
    end

    test "an Ink Donor's unpaid renewal is closed 14 days after it was due" do
      u =
        create_user()
        |> User.ink_donor_changeset(%{square_donor_subscription_id: @sub, ink_donor_status: "active", ink_donor_amount_cents: 100})
        |> Repo.update!()

      stub_square([invoice("UNPAID", iso(Date.add(today(), -5)))])
      UnpaidRenewals.check_all()
      refute_received {:canceled_subscription, _}
      assert Repo.get!(User, u.id).ink_donor_status == "past_due"

      stub_square([invoice("UNPAID", iso(Date.add(today(), -16)))])
      UnpaidRenewals.check_all()
      assert_received {:canceled_subscription, @sub}
      assert Repo.get!(User, u.id).ink_donor_status == "canceled"
    end
  end

  describe "an unpaid invoice canceled in Square (written off)" do
    # 2026-10-11: Stanton canceled @tim's September invoice in Square. The
    # daily check only knew PAID and UNPAID, so Tim stayed "Renewal never
    # paid" on Admin and his billing page asked him to pay an invoice that no
    # longer existed.
    setup do
      due = Date.add(today(), -10)

      u =
        plus_member(%{
          subscription_status: "past_due",
          subscription_expires_at: UnpaidRenewals.grace_ends_at(due)
        })

      stub_square([invoice("CANCELED", iso(due), %{"next_payment_amount_money" => nil}), invoice("PAID", iso(Date.add(due, -30)))])
      %{user: u, due: due}
    end

    test "during the grace it's nothing owed, and the account stays as it is", %{user: u} do
      assert UnpaidRenewals.check_plus(u) == :written_off
      reloaded = Repo.get!(User, u.id)
      assert reloaded.subscription_status == "past_due"
      assert reloaded.subscription_expires_at == u.subscription_expires_at
    end

    test "when the grace ends the subscription is closed (the invoice is already canceled)", %{user: u} do
      u = u |> User.subscription_changeset(%{subscription_expires_at: DateTime.add(DateTime.utc_now(), -1, :hour)}) |> Repo.update!()
      assert UnpaidRenewals.check_plus(u) == :closed
      assert_received {:canceled_subscription, @sub}
      refute_received {:canceled_invoice, _}
      assert Repo.get!(User, u.id).subscription_tier == "free"
    end

    test "the billing page says nothing is owed", %{user: u, due: due} do
      assert %{state: :written_off, url: nil, due_date: ^due} = UnpaidRenewals.renewal_invoice(u)
    end

    test "Admin shows it as a plain row, not a warning", %{user: u} do
      Application.put_env(:inkwell, :admin_overview_subscription_fetcher, fn _ ->
        {:ok,
         %{
           "id" => @sub,
           "status" => "ACTIVE",
           "charged_through_date" => iso(Date.add(today(), 20)),
           "invoice_ids" => ["INV-#{iso(Date.add(today(), -10))}", "INV-#{iso(Date.add(today(), -40))}"]
         }}
      end)

      overview = Inkwell.Billing.AdminOverview.build()
      row = Enum.find(overview.members, &(&1.id == u.id))
      assert row.kind == "written_off"
      assert row.label == "Invoice canceled"
      refute row.attention
      refute Enum.any?(overview.problems, &(u.username in &1.usernames))
    end

    test "starting Plus again: cancel the old subscription, then checkout opens", %{user: u} do
      grace_end = u.subscription_expires_at
      assert Billing.plus_checkout_state(u) == :payment_failed

      # What "Start Plus again" does first: Square schedules the cancel for the
      # end of the (unpaid) period, after the grace end.
      sub = %{"id" => @sub, "status" => "ACTIVE", "canceled_date" => iso(Date.add(today(), 20))}
      {:ok, canceled} = Billing.mark_plus_canceled(u, sub)

      # The unpaid period isn't handed out as free Plus…
      assert canceled.subscription_expires_at == grace_end
      # …and checkout opens straight away.
      assert Billing.plus_checkout_state(canceled) == :allowed

      # Square's own subscription.updated for the cancel doesn't stretch it either.
      Billing.handle_webhook_event(%{
        "type" => "subscription.updated",
        "data" => %{"object" => %{"subscription" => Map.put(sub, "customer_id", "CUST-none")}}
      })

      assert Repo.get!(User, u.id).subscription_expires_at == grace_end
    end
  end

  test "Admin: an unpaid renewal is information, not a warning" do
    due = Date.add(today(), -3)
    u = plus_member(%{subscription_status: "past_due", subscription_expires_at: UnpaidRenewals.grace_ends_at(due)})
    overview = Inkwell.Billing.AdminOverview.build()
    row = Enum.find(overview.members, &(&1.id == u.id))
    assert row.kind == "payment_failed"
    refute row.attention
    assert overview.problems == []
  end
end
