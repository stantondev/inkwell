defmodule Inkwell.Tipping.Tip do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "tips" do
    belongs_to :sender, Inkwell.Accounts.User
    belongs_to :recipient, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry
    field :amount_cents, :integer
    field :total_cents, :integer
    field :currency, :string, default: "usd"
    field :stripe_payment_intent_id, :string
    field :anonymous, :boolean, default: false
    field :message, :string
    field :status, :string, default: "pending"

    timestamps()
  end

  def changeset(tip, attrs) do
    tip
    |> cast(attrs, [:sender_id, :recipient_id, :entry_id, :amount_cents, :total_cents, :currency,
                     :stripe_payment_intent_id, :anonymous, :message, :status])
    |> validate_required([:sender_id, :recipient_id, :amount_cents, :total_cents, :status])
    |> validate_number(:amount_cents, greater_than_or_equal_to: 100, less_than_or_equal_to: 10_000)
    |> validate_length(:message, max: 200)
    |> validate_inclusion(:status, ~w(pending succeeded failed refunded))
    |> foreign_key_constraint(:sender_id)
    |> foreign_key_constraint(:recipient_id)
    |> unique_constraint(:stripe_payment_intent_id)
  end
end
