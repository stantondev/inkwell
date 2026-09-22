defmodule Inkwell.Billing.CheckoutAttempt do
  @moduledoc """
  One row per checkout page we hand a member — the start of the funnel.

  Without this we only ever saw the end of it (subscriptions created), so a
  checkout that always failed on Square's side looked exactly like nobody
  wanting to pay. See `Inkwell.Billing.Funnel`.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # Recurring kinds are the ones a subscription should follow; founding and
  # donation are one-off payments.
  @subscription_kinds ~w(plus plus_annual donor)
  @kinds @subscription_kinds ++ ~w(founding donation)

  schema "billing_checkout_attempts" do
    field :kind, :string
    field :plan_variation_id, :string

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def subscription_kinds, do: @subscription_kinds

  def changeset(attempt, attrs) do
    attempt
    |> cast(attrs, [:user_id, :kind, :plan_variation_id])
    |> validate_required([:user_id, :kind])
    |> validate_inclusion(:kind, @kinds)
  end
end
