defmodule Inkwell.Billing.ExpiredPlusTest do
  @moduledoc """
  Once paid or granted Plus time runs out the account is free — everywhere,
  immediately — without waiting for anyone to run a cleanup (2026-09-21:
  two April grants had kept Plus for four months).
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.{Billing, Repo, SelfHosted}
  alias Inkwell.Accounts.User

  defp plus(attrs) do
    create_user()
    |> User.subscription_changeset(Map.merge(%{subscription_tier: "plus"}, attrs))
    |> Repo.update!()
  end

  defp days(n), do: DateTime.add(DateTime.utc_now(), n, :day)

  describe "User.plus_time_ran_out?/1" do
    test "a canceled member or grant past its date has run out" do
      assert User.plus_time_ran_out?(plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)}))
    end

    test "a canceled member with paid days left has not" do
      refute User.plus_time_ran_out?(plus(%{subscription_status: "canceled", subscription_expires_at: days(5)}))
    end

    test "an active subscriber with an old date on file has not (Square still bills them)" do
      refute User.plus_time_ran_out?(plus(%{subscription_status: "active", subscription_expires_at: days(-60)}))
    end

    test "Founding Members never run out" do
      u = create_user()
      u =
        u
        |> User.founding_member_changeset(%{founding_member_number: 99, founding_member_at: DateTime.utc_now()})
        |> Repo.update!()

      refute User.plus_time_ran_out?(%{u | subscription_status: "canceled", subscription_expires_at: days(-1)})
    end

    test "free accounts and non-users are never flagged" do
      refute User.plus_time_ran_out?(create_user())
      refute User.plus_time_ran_out?(nil)
    end
  end

  test "effective_tier reports free once time has run out" do
    assert SelfHosted.effective_tier(plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})) == "free"
    assert SelfHosted.effective_tier(plus(%{subscription_status: "canceled", subscription_expires_at: days(3)})) == "plus"
    assert SelfHosted.effective_tier(plus(%{subscription_status: "active"})) == "plus"
  end

  describe "end_plus_if_time_ran_out/1 (runs on every signed-in request)" do
    test "a run-out manual grant is downgraded in the database" do
      u = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})
      assert Billing.end_plus_if_time_ran_out(u).subscription_tier == "free"
      assert Repo.get!(User, u.id).subscription_tier == "free"
    end

    test "with a Square subscription on file, only this request sees free" do
      u = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1), square_subscription_id: "S1"})
      assert Billing.end_plus_if_time_ran_out(u).subscription_tier == "free"
      assert Repo.get!(User, u.id).subscription_tier == "plus"
    end

    test "members with time left are untouched" do
      u = plus(%{subscription_status: "active"})
      assert Billing.end_plus_if_time_ran_out(u) == u
    end
  end

  test "the plug hands controllers the free account" do
    u = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})

    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Conn.assign(:current_user, u)
      |> InkwellWeb.Plugs.EffectiveTier.call([])

    assert conn.assigns.current_user.subscription_tier == "free"
  end

  describe "expire_grace_periods/1 (admin \"End expired Plus\")" do
    test "ends manual grants, but not while Square can't confirm a subscription ended" do
      grant = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})
      # No SQUARE_ACCESS_TOKEN in tests, so Square is unreachable.
      with_sub = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1), square_subscription_id: "S1"})

      result = Billing.expire_grace_periods(dry_run: false)
      assert Enum.map(result.downgraded, & &1.id) == [grant.id]
      assert Repo.get!(User, with_sub.id).subscription_tier == "plus"
    end
  end

  test "admin Billing page lists run-out accounts as needing attention" do
    expired = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})
    granted = plus(%{subscription_status: "canceled", subscription_expires_at: days(10)})
    overview = Inkwell.Billing.AdminOverview.build()
    kind = fn u -> Enum.find(overview.members, &(&1.id == u.id)).kind end

    assert kind.(expired) == "expired"
    assert kind.(granted) == "granted"
    assert overview.status == "attention"
    assert Enum.any?(overview.problems, &(&1.kind == "expired" and expired.username in &1.usernames))
  end

  test "admin Billing page is calm when everything checks out" do
    plus(%{subscription_status: "canceled", subscription_expires_at: days(10)})
    overview = Inkwell.Billing.AdminOverview.build()
    # No webhooks and no paying members in tests: nothing to flag.
    assert overview.problems == []
    assert overview.status == "ok"
  end

  test "admin Plus counts and the Plus filter leave out run-out accounts" do
    before = Inkwell.Accounts.platform_stats().plus_subscribers
    expired = plus(%{subscription_status: "canceled", subscription_expires_at: days(-1)})
    current = plus(%{subscription_status: "active"})
    assert Inkwell.Accounts.platform_stats().plus_subscribers == before + 1

    ids = Enum.map(Inkwell.Accounts.recent_plus_subscribers(100), & &1.id)
    assert current.id in ids
    refute expired.id in ids
  end
end
