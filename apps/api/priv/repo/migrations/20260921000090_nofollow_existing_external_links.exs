defmodule Inkwell.Repo.Migrations.NofollowExistingExternalLinks do
  @moduledoc """
  Adds rel="nofollow ugc" to links to other sites in content written before
  the sanitizer started doing it (2026-09-21). Only rows containing an
  absolute link are read. Idempotent: running it again changes nothing.
  """
  use Ecto.Migration

  @targets [
    {"entries", "body_html"},
    {"comments", "body_html"},
    {"users", "bio_html"},
    {"users", "profile_html"},
    {"circle_discussions", "body_html"},
    {"circle_responses", "body_html"},
    {"feedback_comments", "body"},
    {"poll_comments", "body"}
  ]

  def up do
    for {table, col} <- @targets do
      %{rows: rows} =
        repo().query!(~s(SELECT id, "#{col}" FROM "#{table}" WHERE "#{col}" ~* 'href\\s*=\\s*"https?://'))

      changed =
        Enum.count(rows, fn [id, html] ->
          new = Inkwell.HtmlSanitizer.nofollow_external_links(html)

          if new != html do
            repo().query!(~s(UPDATE "#{table}" SET "#{col}" = $1 WHERE id = $2), [new, id])
            true
          end
        end)

      IO.puts("[nofollow] #{table}.#{col}: #{changed} of #{length(rows)} rows updated")
    end
  end

  def down, do: :ok
end
