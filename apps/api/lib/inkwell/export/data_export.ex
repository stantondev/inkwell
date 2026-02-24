defmodule Inkwell.Export.DataExport do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "data_exports" do
    field :status, :string, default: "pending"
    field :data, :binary
    field :file_size, :integer
    field :error_message, :string
    field :expires_at, :utc_datetime_usec
    field :completed_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(export, attrs) do
    export
    |> cast(attrs, [:user_id, :status, :data, :file_size, :error_message, :expires_at, :completed_at])
    |> validate_required([:user_id, :status])
    |> validate_inclusion(:status, ["pending", "processing", "completed", "failed"])
  end
end
