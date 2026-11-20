defmodule InkwellWeb.PlusLevelsTest do
  @moduledoc """
  Plus has two levels since 2026-11-20: Member ($5/mo, $50/yr) and Supporter
  ($10/mo, $100/yr), each with its own STATIC plan variation in Square.

  The thing that must never happen is a buyer being sent to the wrong plan, so
  these tests pin which plan variation every combination of level and interval
  asks Square about, from both checkout endpoints. Square's real API is never
  reached: the catalog lookup is stubbed to answer RELATIVE, which makes the
  checkout stop at the plan guard (503) right after naming the plan it chose.
  """
  use InkwellWeb.ConnCase, async: false
  @moduletag :capture_log

  alias Inkwell.Repo

  @plans [
    access_token: "test-token",
    location_id: "LOC",
    plus_plan_variation_id: "MEMBER_M",
    plus_annual_plan_variation_id: "MEMBER_Y",
    plus_supporter_plan_variation_id: "SUPPORTER_M",
    plus_supporter_annual_plan_variation_id: "SUPPORTER_Y",
    donor_plan_variation_1: "DONOR1"
  ]

  setup do
    Application.put_env(:inkwell, :square, @plans)

    if :ets.whereis(:square_plan_pricing_cache) != :undefined do
      :ets.delete_all_objects(:square_plan_pricing_cache)
    end

    test_pid = self()

    Application.put_env(:inkwell, :square_catalog_fetcher, fn id ->
      send(test_pid, {:plan_checked, id})

      {:ok,
       %{
         "object" => %{
           "type" => "SUBSCRIPTION_PLAN_VARIATION",
           "subscription_plan_variation_data" => %{
             "phases" => [%{"cadence" => "MONTHLY", "pricing" => %{"type" => "RELATIVE"}}]
           }
         }
       }}
    end)

    on_exit(fn ->
      Application.delete_env(:inkwell, :square)
      Application.delete_env(:inkwell, :square_catalog_fetcher)
    end)

    # A member with a Square customer already on file, so checkout goes
    # straight to the payment link without creating a customer.
    user =
      create_user()
      |> Ecto.Changeset.change(%{square_customer_id: "CUST_1"})
      |> Repo.update!()

    %{user: user}
  end

  defp checkout(conn, user, path, body) do
    :ets.whereis(:billing_rate_limit) != :undefined &&
      :ets.delete(:billing_rate_limit, {:billing_checkout, user.id})

    conn |> log_in_user(user) |> post(path, body)
  end

  @matrix [
    {%{}, "MEMBER_M"},
    {%{"interval" => "month"}, "MEMBER_M"},
    {%{"interval" => "year"}, "MEMBER_Y"},
    {%{"level" => "member", "interval" => "year"}, "MEMBER_Y"},
    {%{"level" => "supporter"}, "SUPPORTER_M"},
    {%{"level" => "supporter", "interval" => "month"}, "SUPPORTER_M"},
    {%{"level" => "supporter", "interval" => "year"}, "SUPPORTER_Y"},
    # Anything unrecognised falls back to the member level, never up.
    {%{"level" => "gold", "interval" => "year"}, "MEMBER_Y"}
  ]

  for {{body, plan}, i} <- Enum.with_index(@matrix) do
    @body body
    @plan plan

    test "billing checkout #{i}: #{inspect(body)} → #{plan}", %{conn: conn, user: user} do
      res = checkout(conn, user, "/api/billing/checkout", @body)
      assert json_response(res, 503)
      assert_received {:plan_checked, @plan}
      refute_received {:plan_checked, _}
    end

    test "onboarding checkout #{i}: #{inspect(body)} → #{plan}", %{conn: conn, user: user} do
      res = checkout(conn, user, "/api/billing/onboarding-checkout", Map.put(@body, "type", "plus"))
      assert json_response(res, 503)
      assert_received {:plan_checked, @plan}
      refute_received {:plan_checked, _}
    end
  end

  test "a Supporter checkout is refused while the member already has Plus", %{conn: conn, user: user} do
    user
    |> Ecto.Changeset.change(%{
      subscription_tier: "plus",
      subscription_status: "active",
      square_subscription_id: "SUB_1"
    })
    |> Repo.update!()

    res = checkout(conn, user, "/api/billing/checkout", %{"level" => "supporter", "interval" => "year"})
    assert json_response(res, 409)
    refute_received {:plan_checked, _}
  end

  test "without the Supporter plans configured, Supporter checkout says so", %{conn: conn, user: user} do
    Application.put_env(
      :inkwell,
      :square,
      Keyword.drop(@plans, [:plus_supporter_plan_variation_id, :plus_supporter_annual_plan_variation_id])
    )

    res = checkout(conn, user, "/api/billing/checkout", %{"level" => "supporter"})
    assert json_response(res, 503)
    refute_received {:plan_checked, _}
  end

  test "billing status offers the Supporter level with its prices", %{conn: conn, user: user} do
    data = conn |> log_in_user(user) |> get("/api/billing/status") |> json_response(200) |> Map.fetch!("data")

    assert data["plus_supporter_available"] == true
    assert data["plus_supporter_cents"] == 1000
    assert data["plus_supporter_annual_cents"] == 10000
    assert data["plus_annual_cents"] == 5000

    Application.put_env(:inkwell, :square, Keyword.drop(@plans, [:plus_supporter_annual_plan_variation_id]))
    data = build_conn() |> log_in_user(user) |> get("/api/billing/status") |> json_response(200) |> Map.fetch!("data")
    assert data["plus_supporter_available"] == false
  end

  for plan <- ["SUPPORTER_M", "SUPPORTER_Y"] do
    @plan plan
    test "a #{plan} subscription from Square gives Plus, not the donor badge", %{user: user} do
      event = %{
        "type" => "subscription.created",
        "data" => %{
          "object" => %{
            "subscription" => %{
              "id" => "SUB_#{@plan}",
              "status" => "ACTIVE",
              "customer_id" => "CUST_1",
              "plan_variation_id" => @plan
            }
          }
        }
      }

      ExUnit.CaptureLog.capture_log(fn -> assert Inkwell.Billing.handle_webhook_event(event) == :ok end)

      user = Repo.get!(Inkwell.Accounts.User, user.id)
      assert user.subscription_tier == "plus"
      assert user.subscription_status == "active"
      assert user.square_subscription_id == "SUB_#{@plan}"
      assert is_nil(user.ink_donor_status)
    end
  end
end
