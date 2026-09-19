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
  describe "Plus checkout while an existing subscription is still live" do
    defp user_with(attrs) do
      create_user() |> Ecto.Changeset.change(attrs) |> Inkwell.Repo.update!()
    end

    test "a failed payment gets pointed to Cancel and start over, not a second subscription", %{conn: conn} do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})

      body = json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 409)
      assert body["code"] == "payment_failed"
      assert body["error"] =~ "Cancel and start over"

      onboarding =
        post(log_in_user(build_conn(), user), "/api/billing/onboarding-checkout", %{"type" => "plus"})

      assert json_response(onboarding, 409)["code"] == "payment_failed"
    end

    test "a scheduled cancel gets pointed to Keep my Plus", %{conn: conn} do
      user =
        user_with(%{
          square_subscription_id: "S1",
          subscription_tier: "plus",
          subscription_status: "canceled",
          subscription_expires_at: DateTime.add(DateTime.utc_now(), 12, :day)
        })

      body = json_response(post(log_in_user(conn, user), "/api/billing/checkout", %{"interval" => "year"}), 409)
      assert body["code"] == "cancel_scheduled"
      assert body["error"] =~ "Keep my Plus"
      assert body["error"] =~ "until"
    end

    test "an active subscriber is still refused", %{conn: conn} do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "active"})
      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 409)["code"] == "already_subscribed"
    end

    test "after a cancel of a failed subscription, checkout proceeds (to Square)", %{conn: conn} do
      user = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      {:ok, user} = Inkwell.Billing.mark_plus_canceled(user, %{"canceled_date" => "2099-01-01"})

      # 503 = got past the guard and tried Square (unconfigured in tests).
      assert json_response(post(log_in_user(conn, user), "/api/billing/checkout"), 503)
    end

    test "status tells the billing page which state the member is in", %{conn: conn} do
      past_due = user_with(%{square_subscription_id: "S1", subscription_tier: "plus", subscription_status: "past_due"})
      data = json_response(get(log_in_user(conn, past_due), "/api/billing/status"), 200)["data"]
      assert data["plus_checkout"] == "payment_failed"
      refute data["plus_resumable"]

      scheduled =
        user_with(%{
          square_subscription_id: "S2",
          subscription_tier: "plus",
          subscription_status: "canceled",
          subscription_expires_at: DateTime.add(DateTime.utc_now(), 3, :day)
        })

      data = json_response(get(log_in_user(build_conn(), scheduled), "/api/billing/status"), 200)["data"]
      assert data["plus_checkout"] == "cancel_scheduled"
      assert data["plus_resumable"]

      data = json_response(get(log_in_user(build_conn(), create_user()), "/api/billing/status"), 200)["data"]
      assert data["plus_checkout"] == "allowed"
    end

    test "resume refuses when nothing was canceled", %{conn: conn} do
      assert json_response(post(log_in_user(conn, create_user()), "/api/billing/resume"), 409)
    end
  end
end
