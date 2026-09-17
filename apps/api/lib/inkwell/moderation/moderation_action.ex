defmodule Inkwell.Moderation.ModerationAction do
  @moduledoc "Audit log of moderation decisions (automated or by an admin)."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @actions ~w(block limit hide_entry clear)

  schema "moderation_actions" do
    field :action, :string
    field :automated, :boolean, default: true
    field :score, :integer
    field :reasons, {:array, :string}, default: []
    field :hidden_entry_ids, {:array, :binary_id}, default: []
    field :reversed_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry
    belongs_to :reversed_by, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(action, attrs) do
    action
    |> cast(attrs, [:user_id, :entry_id, :action, :automated, :score, :reasons, :hidden_entry_ids])
    |> validate_required([:user_id, :action])
    |> validate_inclusion(:action, @actions)
  end
end
