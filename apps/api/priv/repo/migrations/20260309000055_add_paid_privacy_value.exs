defmodule Inkwell.Repo.Migrations.AddPaidPrivacyValue do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def up do
    execute "ALTER TYPE entries_privacy ADD VALUE IF NOT EXISTS 'paid'"
  end

  def down do
    # Postgres enum values cannot be removed without recreating the type.
    # This is intentionally a no-op — the value remains harmless if unused.
    :ok
  end
end
