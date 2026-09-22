defmodule Inkwell.Billing.UnmatchedSubscriptionAlertTest do
  @moduledoc """
  A subscription webhook we can't tie to a member returns :error on purpose,
  so Oban retries it — the member can appear between attempts. The admin
  alert must not repeat with each retry.

  Seen 2026-09-22: three unresolvable subscriptions produced a scatter of
  Slack messages over several minutes (max_attempts 5, spread by backoff),
  which reads like a much bigger event than it is.
  """
  use Inkwell.DataCase, async: false

  import ExUnit.CaptureLog

  alias Inkwell.Billing

  # Slack messages are logged rather than sent when no webhook is configured,
  # which is how this test observes them — but they're logged at :info, below
  # the test env's level, so raise it for the duration.
  setup do
    previous = Logger.level()
    Logger.configure(level: :info)
    on_exit(fn -> Logger.configure(level: previous) end)
    :ok
  end

  defp subscription_created_event(sub_id) do
    %{
      "type" => "subscription.created",
      "data" => %{
        "object" => %{
          "subscription" => %{
            "id" => sub_id,
            "status" => "ACTIVE",
            "customer_id" => "CUSTOMER_WE_DONT_KNOW",
            "plan_variation_id" => "SOME_PLAN"
          }
        }
      }
    }
  end

  # Counting the logged Slack lines counts the alerts actually sent.
  defp alerts_in(log), do: log |> String.split("\n") |> Enum.count(&(&1 =~ "Unmatched Square subscription"))

  defp capture(fun), do: capture_log(fun)

  test "an unresolvable subscription alerts once, however many times it is retried" do
    event = subscription_created_event("sub_retry_me")

    first = capture(fn -> assert Billing.handle_webhook_event(event) == :error end)
    assert alerts_in(first) == 1

    # Oban's retries: the handler still reports failure so the job keeps its
    # place in the queue, but the admin isn't told again.
    retries = capture(fn -> for _ <- 1..4, do: Billing.handle_webhook_event(event) end)
    assert alerts_in(retries) == 0
  end

  test "a different unresolvable subscription still gets its own alert" do
    one = capture(fn -> Billing.handle_webhook_event(subscription_created_event("sub_a")) end)
    two = capture(fn -> Billing.handle_webhook_event(subscription_created_event("sub_b")) end)

    assert alerts_in(one) == 1
    assert alerts_in(two) == 1
  end
end
