defmodule Inkwell.Federation.RelaySubscription do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "relay_subscriptions" do
    field :relay_url, :string
    field :relay_inbox, :string
    field :relay_domain, :string
    field :status, :string, default: "pending"
    field :content_filter, :map, default: %{}
    field :entry_count, :integer, default: 0
    field :last_activity_at, :utc_datetime_usec
    field :error_message, :string
    field :instance_actor_id, :binary_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(sub, attrs) do
    sub
    |> cast(attrs, [
      :relay_url, :relay_inbox, :relay_domain, :status,
      :content_filter, :entry_count, :last_activity_at,
      :error_message, :instance_actor_id
    ])
    |> validate_required([:relay_url, :relay_inbox, :relay_domain, :instance_actor_id])
    |> validate_inclusion(:status, ~w[pending active paused error])
    |> unique_constraint(:relay_url)
  end
end
