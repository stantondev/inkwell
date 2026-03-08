defmodule Inkwell.Repo.Migrations.AddPaidPrivacyValue do
  use Ecto.Migration

  # No-op migration. The `privacy` column on entries is a varchar (plain string)
  # validated at the Ecto.Enum level, NOT a PostgreSQL enum type.
  # Adding :paid to the Ecto.Enum values list in entry.ex is sufficient.
  # The original migration tried `ALTER TYPE entries_privacy ADD VALUE ...`
  # which crashed because that PG type doesn't exist.

  def up do
    :ok
  end

  def down do
    :ok
  end
end
