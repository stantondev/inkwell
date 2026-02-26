defmodule Inkwell.Newsletter.Send do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "newsletter_sends" do
    field :subject, :string
    field :status, :string, default: "queued"
    field :recipient_count, :integer, default: 0
    field :sent_count, :integer, default: 0
    field :failed_count, :integer, default: 0
    field :scheduled_at, :utc_datetime_usec
    field :started_at, :utc_datetime_usec
    field :completed_at, :utc_datetime_usec
    field :error_message, :string

    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :writer, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(send, attrs) do
    send
    |> cast(attrs, [:subject, :status, :recipient_count, :sent_count, :failed_count,
                     :scheduled_at, :started_at, :completed_at, :error_message,
                     :entry_id, :writer_id])
    |> validate_required([:writer_id, :status])
    |> validate_inclusion(:status, ["queued", "sending", "sent", "failed", "cancelled"])
  end
end
