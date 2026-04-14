defmodule Inkwell.Moderation.UserWarning do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "user_warnings" do
    field :reason, :string
    field :details, :string
    field :strike_number, :integer
    field :escalated_to_block, :boolean, default: false

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :issued_by, Inkwell.Accounts.User
    belongs_to :report, Inkwell.Moderation.Report
    belongs_to :entry, Inkwell.Journals.Entry

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(warning, attrs) do
    warning
    |> cast(attrs, [
      :user_id,
      :issued_by_id,
      :reason,
      :details,
      :report_id,
      :entry_id,
      :strike_number,
      :escalated_to_block
    ])
    |> validate_required([:user_id, :reason, :strike_number])
    |> validate_length(:details, max: 2000)
  end
end
