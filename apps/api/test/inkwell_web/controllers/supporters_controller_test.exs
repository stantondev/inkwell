defmodule InkwellWeb.SupportersControllerTest do
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Billing.Founding

  describe "POST /api/billing/start-trial" do
    test "starts a trial once, then refuses", %{conn: conn} do
      user = create_user()

      res = post(log_in_user(conn, user), "/api/billing/start-trial")
      body = json_response(res, 200)
      assert body["subscription_tier"] == "plus"
      assert body["subscription_status"] == "trialing"

      again = post(log_in_user(build_conn(), user), "/api/billing/start-trial")
      assert json_response(again, 409)["error"] =~ "already"
    end

    test "requires sign-in", %{conn: conn} do
      assert conn |> post("/api/billing/start-trial") |> json_response(401)
    end
  end

  describe "POST /api/billing/founding-checkout" do
    test "existing founding member gets a clear 409", %{conn: conn} do
      user = create_user()
      {:ok, member, _} = Founding.grant(user, "pay_ctl")

      res = post(log_in_user(conn, member), "/api/billing/founding-checkout")
      assert json_response(res, 409)["error"] =~ "already a Founding Member"
    end

    test "non-member reaches Square (503 when unconfigured)", %{conn: conn} do
      res = post(log_in_user(conn, create_user()), "/api/billing/founding-checkout")
      assert json_response(res, 503)
    end

    test "founding members can't start a Plus subscription checkout", %{conn: conn} do
      {:ok, member, _} = Founding.grant(create_user(), "pay_ctl2")
      res = post(log_in_user(conn, member), "/api/billing/checkout")
      assert json_response(res, 409)
    end
  end

  describe "GET /api/billing/status" do
    test "includes founding, trial and yearly fields", %{conn: conn} do
      data = conn |> log_in_user(create_user()) |> get("/api/billing/status") |> json_response(200)
      d = data["data"]

      assert d["trial_eligible"] == true
      assert d["trial_days"] == 14
      assert d["founding"]["cap"] == 50
      assert d["plus_annual_available"] == false
      assert Map.has_key?(d, "founding_member_number")
    end
  end

  describe "GET /api/transparency" do
    test "is public", %{conn: conn} do
      d = conn |> get("/api/transparency") |> json_response(200) |> Map.fetch!("data")
      assert d["monthly_cost_cents"] > 0
      assert is_list(d["costs"])
    end
  end
end
