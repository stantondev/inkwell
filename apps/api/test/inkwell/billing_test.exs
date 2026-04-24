defmodule Inkwell.BillingTest do
  use Inkwell.DataCase, async: true

  alias Inkwell.Billing

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  defp set_square_customer_id(user, customer_id) do
    user
    |> User.subscription_changeset(%{square_customer_id: customer_id})
    |> Repo.update!()
  end

  describe "ensure_square_customer/1" do
    test "returns the existing square_customer_id without calling Square" do
      # User with a customer_id already set — this is the fast-path branch
      # and must NEVER call the Square API (would cause duplicate customers
      # and extra API latency on every checkout button click).
      user =
        create_user()
        |> set_square_customer_id("existing-customer-abc-123")

      assert {:ok, "existing-customer-abc-123", returned_user} =
               Billing.ensure_square_customer(user)

      assert returned_user.id == user.id
      assert returned_user.square_customer_id == "existing-customer-abc-123"
    end

    test "falls through to the create path when customer_id is nil" do
      # With no Square credentials configured in test env, the create path
      # bottoms out in {:error, :square_not_configured}. Proves we tried
      # to create a customer rather than returning nil as a valid customer_id.
      user = create_user()

      assert is_nil(user.square_customer_id)
      assert {:error, :square_not_configured} = Billing.ensure_square_customer(user)
    end
  end
end
