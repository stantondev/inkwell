defmodule Inkwell.Billing.OrderTemplateMatchTest do
  @moduledoc """
  2026-10-01: @eve (fediverse placeholder email) paid for Plus with a masked
  email. Square made a fresh customer, so the subscription matched nobody and
  she paid without getting Plus. The subscription's order_template_id still
  pointed at our Payment Link order, which carries her user id.
  """
  use Inkwell.DataCase, async: false

  import ExUnit.CaptureLog
  import Inkwell.Factory
  alias Inkwell.{Billing, Repo}
  alias Inkwell.Accounts.User

  setup do
    on_exit(fn -> Application.delete_env(:inkwell, :subscription_order_fetcher) end)
    :ok
  end

  defp event(sub) do
    %{"type" => "subscription.created", "data" => %{"object" => %{"subscription" => sub}}}
  end

  defp sub(extra) do
    Map.merge(
      %{
        "id" => "SUB-EVE",
        "status" => "ACTIVE",
        "customer_id" => "NEW_CUSTOMER_SQUARE_MADE",
        "plan_variation_id" => "PLUS_PLAN"
      },
      extra
    )
  end

  test "matches the member through the subscription's order template" do
    user = create_user()

    Application.put_env(:inkwell, :subscription_order_fetcher, fn
      "TEMPLATE-1" -> {:ok, %{"id" => "TEMPLATE-1", "reference_id" => user.id}}
      _ -> {:error, :not_found}
    end)

    capture_log(fn ->
      assert Billing.handle_webhook_event(event(sub(%{"order_template_id" => "TEMPLATE-1"}))) == :ok
    end)

    user = Repo.get!(User, user.id)
    assert user.subscription_tier == "plus"
    assert user.subscription_status == "active"
    assert user.square_subscription_id == "SUB-EVE"
    assert user.square_customer_id == "NEW_CUSTOMER_SQUARE_MADE"
  end

  test "a template order without a usable reference id still matches nobody" do
    Application.put_env(:inkwell, :subscription_order_fetcher, fn _ ->
      {:ok, %{"id" => "TEMPLATE-2", "reference_id" => "not-a-uuid"}}
    end)

    capture_log(fn ->
      assert Billing.handle_webhook_event(event(sub(%{"id" => "SUB-X", "order_template_id" => "TEMPLATE-2"}))) ==
               :error
    end)
  end
end
