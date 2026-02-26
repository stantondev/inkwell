defmodule Inkwell.Import.DataImport do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "data_imports" do
    field :status, :string, default: "pending"
    field :format, :string
    field :import_mode, :string, default: "draft"
    field :default_privacy, :string, default: "private"
    field :file_data, :binary
    field :file_name, :string
    field :file_size, :integer
    field :total_entries, :integer, default: 0
    field :imported_count, :integer, default: 0
    field :skipped_count, :integer, default: 0
    field :error_count, :integer, default: 0
    field :errors, {:array, :map}, default: []
    field :error_message, :string
    field :completed_at, :utc_datetime_usec
    field :expires_at, :utc_datetime_usec

    belongs_to :user, Inkwell.Accounts.User

    timestamps(type: :utc_datetime_usec)
  end

  @valid_statuses ~w(pending processing completed failed cancelled)
  @valid_formats ~w(inkwell_json generic_csv generic_json wordpress_wxr medium_html substack_csv substack auto)
  @valid_modes ~w(draft published)
  @valid_privacies ~w(public friends_only private)

  def changeset(data_import, attrs) do
    data_import
    |> cast(attrs, [
      :user_id, :status, :format, :import_mode, :default_privacy,
      :file_data, :file_name, :file_size, :total_entries,
      :imported_count, :skipped_count, :error_count, :errors,
      :error_message, :completed_at, :expires_at
    ])
    |> validate_required([:user_id, :status, :format])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:format, @valid_formats)
    |> validate_inclusion(:import_mode, @valid_modes)
    |> validate_inclusion(:default_privacy, @valid_privacies)
  end
end
