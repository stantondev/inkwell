defmodule Inkwell.Release do
  @moduledoc """
  Tasks that can be run from a release (without Mix installed).
  Used by the Docker entrypoint to run migrations on startup.

  Usage:
    bin/inkwell eval "Inkwell.Release.migrate()"
  """

  @app :inkwell

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    Application.load(@app)
  end
end
