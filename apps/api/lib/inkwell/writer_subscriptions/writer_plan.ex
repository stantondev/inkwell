defmodule Inkwell.WriterSubscriptions.WriterPlan do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "writer_plans" do
    belongs_to :writer, Inkwell.Accounts.User
    has_many :subscriptions, Inkwell.WriterSubscriptions.PlanSubscription, foreign_key: :plan_id

    field :name, :string
    field :description, :string
    field :price_cents, :integer
    field :currency, :string, default: "usd"
    field :stripe_product_id, :string
    field :stripe_price_id, :string
    field :status, :string, default: "active"
    field :subscriber_count, :integer, default: 0
    field :total_earned_cents, :integer, default: 0

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(plan, attrs) do
    plan
    |> cast(attrs, [:writer_id, :name, :description, :price_cents, :currency,
                     :stripe_product_id, :stripe_price_id, :status])
    |> validate_required([:writer_id, :name, :price_cents])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 1000)
    |> validate_number(:price_cents, greater_than_or_equal_to: 100, less_than_or_equal_to: 10_000)
    |> validate_inclusion(:status, ~w(active archived))
    |> foreign_key_constraint(:writer_id)
  end

  def update_changeset(plan, attrs) do
    plan
    |> cast(attrs, [:name, :description, :status])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 1000)
    |> validate_inclusion(:status, ~w(active archived))
  end
end
