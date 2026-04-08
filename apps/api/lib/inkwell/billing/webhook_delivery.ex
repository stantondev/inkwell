defmodule Inkwell.Billing.WebhookDelivery do
  @moduledoc """
  Audit log for every inbound webhook delivery attempt.

  Unlike `webhook_events` (which is a dedup table for successfully processed
  events), this table records EVERY hit to the webhook endpoint — including
  ones that failed signature verification or couldn't be parsed. This is our
  source of truth for "is anything arriving at all?" which is exactly the
  question we couldn't answer when Square webhooks were silently failing.

  Status values:
    - "received"         — hit arrived, signature valid, enqueued for processing
    - "processed"        — worker successfully handled the event
    - "signature_failed" — HMAC verification failed
    - "parse_failed"     — body was not valid JSON
    - "handler_failed"   — worker raised/errored during processing
    - "missing_body"     — request had no body
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "webhook_deliveries" do
    field :source, :string
    field :event_type, :string
    field :status, :string
    field :signature_valid, :boolean
    field :remote_ip, :string
    field :body_size, :integer
    field :error, :string

    timestamps(updated_at: false)
  end

  def changeset(delivery, attrs) do
    delivery
    |> cast(attrs, [:source, :event_type, :status, :signature_valid, :remote_ip, :body_size, :error])
    |> validate_required([:source, :status])
  end
end
