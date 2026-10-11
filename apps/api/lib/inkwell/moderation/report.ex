defmodule Inkwell.Moderation.Report do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @valid_reasons ~w[spam harassment hate_speech unlabeled_sensitive csam_illegal impersonation other]
  @valid_statuses ~w[pending reviewed dismissed actioned]

  schema "reports" do
    field :reason, :string
    field :details, :string
    field :status, :string, default: "pending"
    field :admin_notes, :string
    field :resolved_at, :utc_datetime_usec

    belongs_to :reporter, Inkwell.Accounts.User
    belongs_to :entry, Inkwell.Journals.Entry
    # The account the report is about: the entry's author for entry reports,
    # the account itself for account reports (entry_id nil).
    belongs_to :reported_user, Inkwell.Accounts.User
    belongs_to :resolved_by_user, Inkwell.Accounts.User, foreign_key: :resolved_by

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(report, attrs) do
    report
    |> cast(attrs, [:reason, :details, :reporter_id, :entry_id, :reported_user_id])
    |> validate_required([:reason, :reporter_id, :entry_id])
    |> validate_inclusion(:reason, @valid_reasons)
    |> validate_length(:details, max: 2000)
    |> unique_constraint([:reporter_id, :entry_id], message: "You have already reported this entry")
  end

  @doc "A report about an account as a whole (its profile, bio, requests, letters)."
  def account_changeset(report, attrs) do
    report
    |> cast(attrs, [:reason, :details, :reporter_id, :reported_user_id])
    |> validate_required([:reason, :reporter_id, :reported_user_id])
    |> validate_inclusion(:reason, @valid_reasons -- ["unlabeled_sensitive"])
    |> validate_length(:details, max: 2000)
    |> unique_constraint([:reporter_id, :reported_user_id],
      name: :reports_reporter_account_index,
      message: "You have already reported this account"
    )
  end

  def resolve_changeset(report, attrs) do
    report
    |> cast(attrs, [:status, :admin_notes, :resolved_by, :resolved_at])
    |> validate_inclusion(:status, @valid_statuses)
  end
end
