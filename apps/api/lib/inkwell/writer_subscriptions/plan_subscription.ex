defmodule Inkwell.WriterSubscriptions.PlanSubscription do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "writer_plan_subscriptions" do
    belongs_to :plan, Inkwell.WriterSubscriptions.WriterPlan
    belongs_to :subscriber, Inkwell.Accounts.User
    belongs_to :writer, Inkwell.Accounts.User

    field :stripe_subscription_id, :string
    field :status, :string, default: "active"
    field :current_period_end, :utc_datetime_usec
    field :canceled_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(sub, attrs) do
    sub
    |> cast(attrs, [:plan_id, :subscriber_id, :writer_id, :stripe_subscription_id,
                     :status, :current_period_end, :canceled_at])
    |> validate_required([:plan_id, :subscriber_id, :writer_id])
    |> validate_inclusion(:status, ~w(active past_due canceled expired))
    |> unique_constraint([:subscriber_id, :writer_id])
    |> foreign_key_constraint(:plan_id)
    |> foreign_key_constraint(:subscriber_id)
    |> foreign_key_constraint(:writer_id)
  end
end
