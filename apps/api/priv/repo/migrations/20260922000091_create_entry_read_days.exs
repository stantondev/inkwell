defmodule Inkwell.Repo.Migrations.CreateEntryReadDays do
  use Ecto.Migration

  # Reader stats. Only daily totals per entry and referring site are kept —
  # no IP addresses, no visitor IDs, nothing that identifies a reader.
  def change do
    create table(:entry_read_days, primary_key: false) do
      add :entry_id, references(:entries, type: :binary_id, on_delete: :delete_all), null: false
      add :day, :date, null: false
      # Referring site's host ("" for none/direct, "inkwell" for Inkwell itself)
      add :referrer, :string, size: 100, null: false, default: ""
      add :count, :integer, null: false, default: 0
    end

    create unique_index(:entry_read_days, [:entry_id, :day, :referrer])
    create index(:entry_read_days, [:day])
  end
end
