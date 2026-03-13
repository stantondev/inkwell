defmodule Inkwell.Push.PushSubscription do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "push_subscriptions" do
    belongs_to :user, Inkwell.Accounts.User
    field :endpoint, :string
    field :p256dh, :string
    field :auth, :string
    field :user_agent, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(subscription, attrs) do
    subscription
    |> cast(attrs, [:user_id, :endpoint, :p256dh, :auth, :user_agent])
    |> validate_required([:user_id, :endpoint, :p256dh, :auth])
    |> validate_length(:endpoint, max: 2000)
    |> validate_length(:user_agent, max: 500)
    |> unique_constraint(:endpoint)
  end
end
