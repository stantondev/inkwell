defmodule Inkwell.Billing.SquareSyncSafetyTest do
  @moduledoc """
  Billing decisions tightened in the 2026-09-19 audit, so a paying member is
  never downgraded, or handed someone else's subscription, by mistake.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.Billing

  describe "owned_customer_ids/3 — Square's email search is fuzzy" do
    setup do
      %{user: create_user(%{email: "john@gmail.com"})}
    end

    test "keeps exact email matches (ignoring case and spaces)", %{user: user} do
      customers = [%{"id" => "C1", "email_address" => " John@Gmail.com "}]
      assert Billing.owned_customer_ids(customers, user, "john@gmail.com") == ["C1"]
    end

    test "drops lookalike addresses a fuzzy search returns", %{user: user} do
      customers = [
        %{"id" => "C2", "email_address" => "john.doe@gmail.com"},
        %{"id" => "C3", "email_address" => "johnny@gmail.com"},
        %{"id" => "C4", "email_address" => nil}
      ]

      assert Billing.owned_customer_ids(customers, user, "john@gmail.com") == []
    end

    test "keeps customers tagged with this user's id even with another email", %{user: user} do
      customers = [%{"id" => "C5", "email_address" => "work@company.com", "reference_id" => user.id}]
      assert Billing.owned_customer_ids(customers, user, "john@gmail.com") == ["C5"]
    end
  end

  describe "subscription_confirmed_ended?/2 — never downgrade on a guess" do
    test "the user's own subscription shown as CANCELED is confirmed ended" do
      assert Billing.subscription_confirmed_ended?("S1", [%{"id" => "S1", "status" => "CANCELED"}])
    end

    test "an ACTIVE or PENDING subscription is not ended" do
      refute Billing.subscription_confirmed_ended?("S1", [%{"id" => "S1", "status" => "ACTIVE"}])
      refute Billing.subscription_confirmed_ended?("S1", [%{"id" => "S1", "status" => "PENDING"}])
    end

    test "not finding the subscription (and Square unreachable) is not proof it ended" do
      # No SQUARE_ACCESS_TOKEN in tests, so the direct lookup fails.
      refute Billing.subscription_confirmed_ended?("S1", [%{"id" => "OTHER", "status" => "CANCELED"}])
    end

    test "a user without a subscription id is never treated as ended" do
      refute Billing.subscription_confirmed_ended?(nil, [])
    end
  end

  describe "stale_subscription_event?/3 — events about an old subscription" do
    test "an old subscription ending doesn't cancel the member's current one" do
      assert Billing.stale_subscription_event?("NEW", "OLD", "canceled")
      assert Billing.stale_subscription_event?("NEW", "OLD", "past_due")
    end

    test "a different subscription becoming active is adopted" do
      refute Billing.stale_subscription_event?("OLD", "NEW", "active")
    end

    test "events about the current subscription apply" do
      refute Billing.stale_subscription_event?("S1", "S1", "canceled")
    end

    test "with no current subscription, anything applies" do
      refute Billing.stale_subscription_event?(nil, "S1", "canceled")
    end
  end

  describe "effective_square_status/1" do
    test "ACTIVE with a scheduled cancel date reads as canceled" do
      assert Billing.effective_square_status(%{"status" => "ACTIVE", "canceled_date" => "2026-10-19"}) == "canceled"
    end

    test "plain statuses map as before" do
      assert Billing.effective_square_status(%{"status" => "ACTIVE"}) == "active"
      assert Billing.effective_square_status(%{"status" => "CANCELED"}) == "canceled"
      assert Billing.effective_square_status(%{"status" => "PAUSED"}) == "past_due"
    end
  end

  describe "webhook retries" do
    test "a failed attempt doesn't make retries skip the event" do
      Billing.record_event("evt_retry_1", "payment.updated", "failed")
      refute Billing.already_processed?("evt_retry_1")

      Billing.record_event("evt_retry_1", "payment.updated", "processed")
      assert Billing.already_processed?("evt_retry_1")
    end
  end
end
