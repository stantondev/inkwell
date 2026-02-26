defmodule Inkwell.Newsletter.Subscriber do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "newsletter_subscribers" do
    field :email, :string
    field :status, :string, default: "pending"
    field :confirm_token, :string
    field :unsubscribe_token, :string
    field :source, :string, default: "subscribe_page"
    field :confirmed_at, :utc_datetime_usec
    field :unsubscribed_at, :utc_datetime_usec

    belongs_to :writer, Inkwell.Accounts.User
    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(subscriber, attrs) do
    subscriber
    |> cast(attrs, [:email, :status, :confirm_token, :unsubscribe_token, :source,
                     :confirmed_at, :unsubscribed_at, :writer_id, :user_id])
    |> validate_required([:email, :writer_id, :unsubscribe_token])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+\.[^\s]+$/, message: "must be a valid email")
    |> validate_inclusion(:status, ["pending", "confirmed", "unsubscribed"])
    |> unique_constraint([:writer_id, :email])
  end
end
