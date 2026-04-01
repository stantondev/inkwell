defmodule Inkwell.Billing.WebhookEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "webhook_events" do
    field :event_id, :string
    field :event_type, :string
    field :status, :string, default: "processed"

    timestamps(updated_at: false)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [:event_id, :event_type, :status])
    |> validate_required([:event_id, :event_type])
  end
end
