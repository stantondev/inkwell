defmodule InkwellWeb.BillingControllerTest do
  @moduledoc """
  Regression tests for the checkout throttle.

  The throttle used to be recorded *before* the checkout attempt ran, with a
  900-second window and no way to clear it. That meant a single failed checkout
  locked the user out for 15 minutes behind a message that read like a card
  decline ("You can only process one purchase at a time"), so a user hitting any
  transient error would try a few times, get told their purchase was refused,
  and give up. At least one prospective subscriber was lost to it.

  The throttle is now recorded only on success, so a failure never blocks a
  retry.

  Square is not configured in the test environment, so checkout always fails
  with :square_not_configured -> 503. That is exactly the "failed attempt" case
  these tests need.
  """
  use InkwellWeb.ConnCase, async: false

  @throttle_table :billing_rate_limit

  defp throttle_key(user), do: {:billing_checkout, user.id}

  describe "POST /api/billing/checkout throttle" do
    test "a failed checkout does NOT lock the user out of retrying", %{conn: conn} do
      user = create_user()

      # First attempt fails (Square unconfigured in test env).
      first = post(log_in_user(conn, user), "/api/billing/checkout")
      assert json_response(first, 503)

      # The user must be able to retry immediately. Before the fix this was a
      # 429 for the next 15 minutes.
      second = post(log_in_user(build_conn(), user), "/api/billing/checkout")
      assert json_response(second, 503)

      third = post(log_in_user(build_conn(), user), "/api/billing/checkout")
      assert json_response(third, 503)
    end

    test "a failed checkout leaves no throttle entry behind", %{conn: conn} do
      user = create_user()

      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 503)

      assert :ets.lookup(@throttle_table, throttle_key(user)) == [],
             "a failed checkout must not record a throttle entry"
    end

    test "a successful checkout throttles the immediate next attempt", %{conn: conn} do
      user = create_user()

      # Create the table via a real request, then simulate the success path
      # having recorded a checkout (we can't reach Square from tests).
      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 503)
      :ets.insert(@throttle_table, {throttle_key(user), System.system_time(:second)})

      throttled = post(log_in_user(build_conn(), user), "/api/billing/checkout")
      body = json_response(throttled, 429)

      # The message must not read as a payment/card rejection.
      refute body["error"] =~ "one purchase at a time"
      assert body["error"] =~ "nothing has been charged"
    end

    test "the throttle is scoped per user", %{conn: conn} do
      user = create_user()
      other = create_user()

      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 503)
      :ets.insert(@throttle_table, {throttle_key(user), System.system_time(:second)})

      # user is throttled...
      assert json_response(post(log_in_user(build_conn(), user), "/api/billing/checkout"), 429)

      # ...but an unrelated user is not.
      assert json_response(post(log_in_user(build_conn(), other), "/api/billing/checkout"), 503)
    end

    test "an expired throttle entry allows a new checkout", %{conn: conn} do
      user = create_user()

      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 503)

      # Older than the 60s window.
      stale = System.system_time(:second) - 120
      :ets.insert(@throttle_table, {throttle_key(user), stale})

      assert json_response(post(log_in_user(build_conn(), user), "/api/billing/checkout"), 503)
    end

    test "requires authentication", %{conn: conn} do
      assert json_response(post(conn, "/api/billing/checkout"), 401)
    end
  end
end
