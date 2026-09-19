defmodule Inkwell.Billing.PlusCheckoutGuardTest do
  @moduledoc """
  A new Plus checkout must never double-bill a member whose existing Square
  subscription is still live: a failed card (past_due) or a cancel that runs
  to the end of a paid period. See Billing.plus_checkout_state/1.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.Accounts.User
  alias Inkwell.Billing
  alias Inkwell.Repo

  @now ~U[2026-09-19 12:00:00.000000Z]

  defp user_with(attrs) do
    create_user() |> Ecto.Changeset.change(attrs) |> Repo.update!()
  end

  defp days_from_now(days), do: DateTime.add(@now, days, :day)

  describe "plus_checkout_state/2" do
    test "someone who never subscribed can check out" do
      assert Billing.plus_checkout_state(create_user(), @now) == :allowed
    end

    test "an active subscriber is already subscribed" do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "active"})
      assert Billing.plus_checkout_state(user, @now) == :already_subscribed
    end

    test "a failed payment blocks a second subscription" do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      assert Billing.plus_checkout_state(user, @now) == :payment_failed
    end

    test "a cancel with paid days left blocks a second subscription" do
      user =
        user_with(%{
          square_subscription_id: "S1",
          subscription_tier: "plus",
          subscription_status: "canceled",
          subscription_expires_at: days_from_now(10)
        })

      assert Billing.plus_checkout_state(user, @now) == :cancel_scheduled
      assert Billing.plus_resumable?(user, @now)
    end

    test "once the paid period is over, checkout opens again" do
      user =
        user_with(%{
          square_subscription_id: "S1",
          subscription_tier: "plus",
          subscription_status: "canceled",
          subscription_expires_at: days_from_now(-1)
        })

      assert Billing.plus_checkout_state(user, @now) == :allowed
      refute Billing.plus_resumable?(user, @now)
    end

    test "a canceled subscription with no known end date doesn't lock the member out" do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "canceled"})
      assert Billing.plus_checkout_state(user, @now) == :allowed
    end

    test "Founding Members are already covered" do
      user = user_with(%{founding_member_number: 7, founding_member_at: @now})
      assert Billing.plus_checkout_state(user, @now) == :already_subscribed
    end

    test "a trial isn't a subscription" do
      user = user_with(%{subscription_tier: "plus", subscription_status: "trialing", subscription_expires_at: days_from_now(5)})
      assert Billing.plus_checkout_state(user, @now) == :allowed
    end
  end

  describe "cancel and start over after a failed payment" do
    test "canceling a past_due subscription lets the member subscribe again right away" do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})

      # Square's cancel response: still ACTIVE, ending at the end of the unpaid period.
      square_sub = %{"id" => "S1", "status" => "ACTIVE", "canceled_date" => "2026-10-05"}
      {:ok, user} = Billing.mark_plus_canceled(user, square_sub)

      assert user.subscription_status == "canceled"
      assert DateTime.compare(user.subscription_expires_at, ~U[2026-10-05 23:59:59Z]) == :eq
      assert Billing.plus_checkout_state(user, @now) == :allowed
      refute Billing.plus_resumable?(user, @now)
    end

    test "Square's follow-up webhook for the canceled subscription doesn't re-block checkout" do
      user = user_with(%{square_customer_id: "C1", square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      {:ok, _} = Billing.mark_plus_canceled(user, nil)

      event = %{
        "type" => "subscription.updated",
        "data" => %{
          "object" => %{
            "subscription" => %{
              "id" => "S1",
              "customer_id" => "C1",
              "status" => "ACTIVE",
              "canceled_date" => Date.to_iso8601(Date.add(DateTime.to_date(DateTime.utc_now()), 20))
            }
          }
        }
      }

      Billing.handle_webhook_event(event)
      user = Repo.get!(User, user.id)

      assert user.subscription_status == "canceled"
      assert DateTime.compare(user.subscription_expires_at, DateTime.utc_now()) == :gt
      assert Billing.plus_checkout_state(user) == :allowed
    end

    test "the new subscription replaces the canceled one" do
      user = user_with(%{square_customer_id: "C1", square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      {:ok, _} = Billing.mark_plus_canceled(user, nil)

      Billing.handle_webhook_event(%{
        "type" => "subscription.created",
        "data" => %{"object" => %{"subscription" => %{"id" => "S2", "customer_id" => "C1", "status" => "ACTIVE"}}}
      })

      user = Repo.get!(User, user.id)
      assert user.square_subscription_id == "S2"
      assert user.subscription_status == "active"
      assert Billing.plus_checkout_state(user) == :already_subscribed

      # The old subscription finally ending must not touch the new one.
      Billing.handle_webhook_event(%{
        "type" => "subscription.updated",
        "data" => %{"object" => %{"subscription" => %{"id" => "S1", "customer_id" => "C1", "status" => "CANCELED", "canceled_date" => "2026-10-05"}}}
      })

      user = Repo.get!(User, user.id)
      assert user.square_subscription_id == "S2"
      assert user.subscription_status == "active"
    end

    test "canceling a paid-up subscription records when it ends and doesn't mark it unpaid" do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "active"})
      square_sub = %{"id" => "S1", "status" => "ACTIVE", "canceled_date" => "2026-10-05"}
      {:ok, user} = Billing.mark_plus_canceled(user, square_sub)

      assert DateTime.compare(user.subscription_expires_at, ~U[2026-10-05 23:59:59Z]) == :eq
      assert Billing.plus_checkout_state(user, @now) == :cancel_scheduled
      assert Billing.plus_resumable?(user, @now)
    end
  end

  describe "resume_plan/1" do
    test "deletes Square's pending CANCEL action" do
      sub = %{
        "status" => "ACTIVE",
        "canceled_date" => "2026-10-05",
        "actions" => [
          %{"id" => "A-SWAP", "type" => "SWAP_PLAN"},
          %{"id" => "A-CANCEL", "type" => "CANCEL", "effective_date" => "2026-10-05"}
        ]
      }

      assert Billing.resume_plan(sub) == {:delete_action, "A-CANCEL"}
    end

    test "a subscription that already ended can't be resumed" do
      assert Billing.resume_plan(%{"status" => "CANCELED", "canceled_date" => "2026-09-01"}) == :not_resumable
      assert Billing.resume_plan(%{"status" => "DEACTIVATED"}) == :not_resumable
    end

    test "a cancel already undone elsewhere just syncs" do
      assert Billing.resume_plan(%{"status" => "ACTIVE"}) == :already_active
    end

    test "a canceled_date with no action to delete isn't guessed at" do
      assert Billing.resume_plan(%{"status" => "ACTIVE", "canceled_date" => "2026-10-05"}) == :not_resumable
    end
  end

  describe "resume_subscription/1" do
    test "refuses when there's nothing to resume" do
      assert Billing.resume_subscription(create_user()) == {:error, :not_resumable}

      past_due = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      assert Billing.resume_subscription(past_due) == {:error, :not_resumable}
    end

    test "asks Square for a resumable subscription (Square isn't configured in tests)" do
      user =
        user_with(%{
          square_subscription_id: "S1",
          subscription_tier: "plus",
          subscription_status: "canceled",
          subscription_expires_at: DateTime.add(DateTime.utc_now(), 10, :day)
        })

      assert Billing.resume_subscription(user) == {:error, :square_not_configured}
      # Nothing changed locally.
      assert Repo.get!(User, user.id).subscription_status == "canceled"
    end
  end
end
