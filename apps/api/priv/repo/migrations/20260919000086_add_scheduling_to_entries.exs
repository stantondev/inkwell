defmodule Inkwell.Repo.Migrations.AddSchedulingToEntries do
  use Ecto.Migration

  # A scheduled post is a draft with a `scheduled_at`. `scheduled_options`
  # keeps the writer's publish-time choices (newsletter, cross-posts) until then.
  def change do
    alter table(:entries) do
      add :scheduled_at, :utc_datetime_usec
      add :scheduled_options, :map, null: false, default: %{}
    end

    create index(:entries, [:scheduled_at],
             where: "status = 'draft' AND scheduled_at IS NOT NULL",
             name: :entries_due_scheduled_index
           )
  end
end
