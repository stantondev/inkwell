defmodule Inkwell.Billing.CheckoutPlanGuardTest do
  @moduledoc """
  Square's hosted checkout cannot complete a subscription whose plan variation
  is priced RELATIVE — the buyer presses pay and Square's own page fails. That
  happened silently to every recurring checkout between 2026-04-24 and
  2026-09-22, because CreatePaymentLink returns a perfectly good URL either
  way. Two nets are pinned here:

    * we ask Square what the plan's pricing actually is before handing anyone
      a link, and refuse a RELATIVE one (failing OPEN if Square can't be
      reached — a lookup blip must not block a sale);
    * we record every checkout we start, so "people keep trying and nobody
      ever completes" is something we can see.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory

  alias Inkwell.Billing.Funnel
  alias Inkwell.Repo
  alias Inkwell.Square

  setup do
    if :ets.whereis(:square_plan_pricing_cache) != :undefined do
      :ets.delete_all_objects(:square_plan_pricing_cache)
    end

    on_exit(fn -> Application.delete_env(:inkwell, :square_catalog_fetcher) end)
    :ok
  end

  defp stub_catalog(fun), do: Application.put_env(:inkwell, :square_catalog_fetcher, fun)

  defp variation(pricing) do
    {:ok,
     %{
       "object" => %{
         "type" => "SUBSCRIPTION_PLAN_VARIATION",
         "subscription_plan_variation_data" => %{
           "phases" => [%{"cadence" => "MONTHLY", "pricing" => pricing}]
         }
       }
     }}
  end

  describe "plan_variation_pricing/1" do
    test "reads the pricing type of the plan's first phase" do
      stub_catalog(fn _ -> variation(%{"type" => "RELATIVE"}) end)
      assert Square.plan_variation_pricing("PLAN") == {:ok, "RELATIVE"}

      :ets.delete_all_objects(:square_plan_pricing_cache)
      stub_catalog(fn _ -> variation(%{"type" => "STATIC", "price_money" => %{"amount" => 500}}) end)
      assert Square.plan_variation_pricing("PLAN") == {:ok, "STATIC"}
    end

    test "a missing plan is reported, not mistaken for a working one" do
      stub_catalog(fn _ -> {:error, {:square_error, 404, "not found"}} end)
      assert Square.plan_variation_pricing("GONE") == {:error, :plan_not_found}
    end

    test "an unrecognised shape is an error rather than a guess" do
      stub_catalog(fn _ -> {:ok, %{"object" => %{"type" => "ITEM"}}} end)
      assert Square.plan_variation_pricing("ODD") == {:error, :unknown_plan_shape}
    end

    test "answers are cached, so checkout doesn't hit the catalog every time" do
      calls = :counters.new(1, [])

      stub_catalog(fn _ ->
        :counters.add(calls, 1, 1)
        variation(%{"type" => "STATIC"})
      end)

      assert Square.plan_variation_pricing("PLAN") == {:ok, "STATIC"}
      assert Square.plan_variation_pricing("PLAN") == {:ok, "STATIC"}
      assert :counters.get(calls, 1) == 1
    end

    test "a failed lookup is not cached, so a Square blip doesn't stick" do
      calls = :counters.new(1, [])

      stub_catalog(fn _ ->
        :counters.add(calls, 1, 1)
        {:error, :http_error}
      end)

      assert Square.plan_variation_pricing("PLAN") == {:error, :http_error}
      assert Square.plan_variation_pricing("PLAN") == {:error, :http_error}
      assert :counters.get(calls, 1) == 2
    end
  end

  describe "creating a subscription payment link" do
    setup do
      Application.put_env(:inkwell, :square,
        access_token: "test-token",
        location_id: "LOC",
        plus_plan_variation_id: "PLAN",
        donor_plan_variation_1: "DONOR1"
      )

      on_exit(fn -> Application.delete_env(:inkwell, :square) end)
      :ok
    end

    test "is refused when Square could never complete it" do
      stub_catalog(fn _ -> variation(%{"type" => "RELATIVE"}) end)
      user = create_user()

      assert Square.create_plus_payment_link(user, "CUST") == {:error, :plan_pricing_unsupported}

      assert Square.create_donor_payment_link(user, 100, "CUST") ==
               {:error, :plan_pricing_unsupported}
    end

    test "fails open when the plan can't be checked" do
      # A lookup that errors is not proof the plan is unusable, so checkout
      # goes ahead. With no access token the call stops before any HTTP, and
      # the error we get back is that — never :plan_pricing_unsupported.
      Application.put_env(:inkwell, :square, location_id: "LOC", plus_plan_variation_id: "PLAN")
      stub_catalog(fn _ -> {:error, :http_error} end)

      assert Square.create_plus_payment_link(create_user(), "CUST") ==
               {:error, :square_not_configured}
    end
  end

  describe "checkout funnel" do
    test "counts the people who started and the ones who ended up subscribed" do
      finisher = create_user()
      Funnel.record_attempt(finisher, "plus")

      finisher
      |> Ecto.Changeset.change(%{square_subscription_id: "sub_1"})
      |> Repo.update!()

      quitter = create_user()
      Funnel.record_attempt(quitter, "plus")
      Funnel.record_attempt(quitter, "donor")

      summary = Funnel.summary()
      assert summary.people == 2
      assert summary.attempts == 3
      assert summary.completed == 1
      refute summary.stalled
    end

    test "flags the case that went unnoticed: several people tried, nobody could pay" do
      for _ <- 1..3, do: Funnel.record_attempt(create_user(), "plus")

      summary = Funnel.summary()
      assert summary.people == 3
      assert summary.completed == 0
      assert summary.stalled
    end

    test "a quiet fortnight with one or two attempts is not an alarm" do
      for _ <- 1..2, do: Funnel.record_attempt(create_user(), "plus")
      refute Funnel.summary().stalled
    end

    test "one-off purchases don't count — they were never broken" do
      for _ <- 1..3, do: Funnel.record_attempt(create_user(), "founding")
      summary = Funnel.summary()
      assert summary.people == 0
      refute summary.stalled
    end

    test "old attempts fall out of the window" do
      user = create_user()
      {:ok, attempt} = Funnel.record_attempt(user, "plus")

      attempt
      |> Ecto.Changeset.change(%{inserted_at: DateTime.add(DateTime.utc_now(), -30, :day)})
      |> Repo.update!()

      assert Funnel.summary().people == 0
    end
  end
end
