defmodule Inkwell.Repo.Migrations.AddExcerptCustomToEntries do
  use Ecto.Migration

  import Ecto.Query

  # Excerpts froze at first save: the editor loaded the auto-generated excerpt
  # into the field and sent it back on every save, so it was never regenerated.
  # `excerpt_custom` records whether the writer wrote the excerpt themselves.
  #
  # Backfill: an excerpt that the entry's text starts with, or one cut at the
  # generator's 280 characters, is (almost always) an auto one, possibly frozen
  # from an early autosave, so it's left unflagged and will be regenerated on the
  # next save. Anything else is kept as the writer's. On a copy of production
  # data this kept 18 of 141 excerpts: mostly written ones, plus a few frozen
  # generated ones whose opening had since been reworded (those stay as they are).
  def up do
    alter table(:entries) do
      add :excerpt_custom, :boolean, null: false, default: false
    end

    flush()

    custom_ids =
      from(e in "entries",
        where: not is_nil(e.excerpt) and e.excerpt != "",
        select: {e.id, e.excerpt, e.body_html}
      )
      |> repo().all()
      |> Enum.reject(fn {_id, excerpt, body} ->
        # Generated excerpts are cut at exactly 280 characters.
        String.length(excerpt) == 280 or String.starts_with?(plain(body), plain(excerpt))
      end)
      |> Enum.map(fn {id, _, _} -> id end)

    custom_ids
    |> Enum.chunk_every(500)
    |> Enum.each(fn ids ->
      from(e in "entries", where: e.id in ^ids) |> repo().update_all(set: [excerpt_custom: true])
    end)
  end

  def down do
    alter table(:entries) do
      remove :excerpt_custom
    end
  end

  defp plain(nil), do: ""

  # Letters and digits only, so entity/punctuation differences between the
  # stored body and the decoded excerpt don't matter.
  defp plain(text) do
    text
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/&#?\w+;/, "")
    |> String.replace(~r/[^\p{L}\p{N}]/u, "")
  end
end
