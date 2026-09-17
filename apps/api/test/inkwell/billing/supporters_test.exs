defmodule Inkwell.Billing.SupportersTest do
  @moduledoc """
  Founding Members, free Plus trials, and the invariant that a founding member
  can never be downgraded by any subscription code path.
  """
  use Inkwell.DataCase, async: false

  alias Inkwell.Accounts.User
  alias Inkwell.Billing
  alias Inkwell.Billing.{Founding, Trials}
  alias Inkwell.Repo

  defp founding!(user, payment_id \\ nil) do
    {:ok, updated, :granted} = Founding.grant(user, payment_id || "pay_" <> Ecto.UUID.generate())
    updated
  end

  describe "Founding.grant/2" do
    test "numbers members in order and makes them Plus with no expiry" do
      a = founding!(create_user())
      b = founding!(create_user())

      assert a.founding_member_number == 1
      assert b.founding_member_number == 2

      for u <- [a, b] do
        assert u.subscription_tier == "plus"
        assert u.subscription_status == "active"
        assert is_nil(u.subscription_expires_at)
        assert u.founding_member_at
      end
    end

    test "is idempotent on the Square payment id" do
      user = create_user()
      {:ok, first, :granted} = Founding.grant(user, "pay_same")
      {:ok, again, :already_granted} = Founding.grant(Repo.reload!(user), "pay_same")

      assert again.id == first.id
      assert again.founding_member_number == first.founding_member_number
      assert Founding.count() == 1
    end

    test "a second payment from an existing member keeps their original number" do
      user = founding!(create_user(), "pay_1")
      assert {:ok, same, :duplicate_payment} = Founding.grant(user, "pay_2")
      assert same.founding_member_number == 1
      assert Founding.count() == 1
    end

    test "status reports sold, remaining and money raised" do
      founding!(create_user())
      status = Founding.status()

      assert status.cap == 50
      assert status.sold == 1
      assert status.remaining == 49
      assert status.raised_cents == 9900
    end

    test "checkout refuses existing members" do
      user = founding!(create_user())
      assert {:error, :already_founding_member} = Founding.create_checkout_session(user)
    end

    test "founding_order?/1 matches only the founding line item" do
      assert Founding.founding_order?(%{"line_items" => [%{"name" => "Inkwell Founding Member"}]})
      refute Founding.founding_order?(%{"line_items" => [%{"name" => "Inkwell Plus"}]})
      refute Founding.founding_order?(%{"line_items" => [%{"name" => "Ink Donor — One-time"}]})
      refute Founding.founding_order?(nil)
    end
  end

  describe "founding members can't be downgraded" do
    test "subscription_changeset ignores attempts to set them to free" do
      user = founding!(create_user())

      updated =
        user
        |> User.subscription_changeset(%{
          subscription_tier: "free",
          subscription_status: "canceled",
          subscription_expires_at: DateTime.utc_now()
        })
        |> Repo.update!()

      assert updated.subscription_tier == "plus"
      assert updated.subscription_status == "active"
      assert is_nil(updated.subscription_expires_at)
    end

    test "cancel_subscription on a founding member with an old Square sub keeps Plus" do
      user =
        founding!(create_user())
        |> User.subscription_changeset(%{square_subscription_id: "sq_sub_old"})
        |> Repo.update!()

      # Square isn't configured in tests, so the remote cancel fails and the
      # local write still happens — it must not downgrade.
      Billing.cancel_subscription(user)
      reloaded = Repo.reload!(user)

      assert reloaded.subscription_tier == "plus"
      assert reloaded.subscription_status == "active"
    end

    test "grace-period expiry never picks them up" do
      user = founding!(create_user())

      # Even a forced stale expiry in the DB can't make them a candidate,
      # because the status is pinned to active.
      Repo.update_all(
        from(u in User, where: u.id == ^user.id),
        set: [subscription_expires_at: DateTime.add(DateTime.utc_now(), -3600)]
      )

      result = Billing.expire_grace_periods(dry_run: false)
      refute Enum.any?(result.downgraded, &(&1.id == user.id))
      assert Repo.reload!(user).subscription_tier == "plus"
    end
  end

  describe "Trials" do
    test "starting a trial gives Plus for 14 days, once" do
      user = create_user()
      assert Trials.eligible?(user)

      {:ok, trialing} = Trials.start(user)
      assert trialing.subscription_tier == "plus"
      assert trialing.subscription_status == "trialing"
      assert trialing.plus_trial_started_at

      days = DateTime.diff(trialing.subscription_expires_at, DateTime.utc_now(), :day)
      assert days in 13..14

      refute Trials.eligible?(trialing)
      assert {:error, :already_plus} = Trials.start(trialing)
    end

    test "can't restart a trial after it has ended" do
      {:ok, trialing} = Trials.start(create_user())
      assert Trials.expire_due(DateTime.add(DateTime.utc_now(), 15, :day)) == 1

      ended = Repo.reload!(trialing)
      assert ended.subscription_tier == "free"
      assert {:error, :trial_already_used} = Trials.start(ended)
    end

    test "expire_due only ends trials that are past their end date" do
      {:ok, fresh} = Trials.start(create_user())
      assert Trials.expire_due() == 0
      assert Repo.reload!(fresh).subscription_tier == "plus"
    end

    test "expire_due leaves paying and founding members alone" do
      paying =
        create_user()
        |> User.subscription_changeset(%{
          subscription_tier: "plus",
          subscription_status: "active",
          square_subscription_id: "sq_live"
        })
        |> Repo.update!()

      member = founding!(create_user())

      Trials.expire_due(DateTime.add(DateTime.utc_now(), 365, :day))

      assert Repo.reload!(paying).subscription_tier == "plus"
      assert Repo.reload!(member).subscription_tier == "plus"
    end

    test "existing Plus and founding members aren't eligible" do
      member = founding!(create_user())
      assert {:error, :already_plus} = Trials.eligibility(member)
    end
  end

  describe "Transparency.stats/0" do
    test "reports configured costs and user counts without Square" do
      Inkwell.Transparency.clear_cache()
      create_user()
      stats = Inkwell.Transparency.stats()

      assert stats.monthly_cost_cents == Enum.reduce(stats.costs, 0, &(&1.monthly_cents + &2))
      assert stats.users.total >= 1
      assert stats.revenue_source == "estimate"
      assert is_integer(stats.percent_covered)
      assert stats.founding.cap == 50
    after
      Inkwell.Transparency.clear_cache()
    end
  end
end
