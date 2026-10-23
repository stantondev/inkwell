defmodule Inkwell.Repo.Migrations.CleanHashtagTags do
  use Ecto.Migration

  # Tags saved with a "#" ("#DailyInk") were a separate tag from "DailyInk",
  # and their tag page 404'd; several hashtags typed into one tag box
  # ("#teen #tobeteen") were one tag. Same rule as Entry.clean_tags/1, copied
  # here so the migration doesn't depend on app code that may change.
  def up do
    %{rows: rows} =
      repo().query!(
        "SELECT id, tags FROM entries WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE '#%' OR t <> btrim(t) OR t = '')"
      )

    for [id, tags] <- rows do
      repo().query!("UPDATE entries SET tags = $1 WHERE id = $2", [clean(tags), id])
    end
  end

  def down, do: :ok

  defp clean(tags) do
    tags
    |> Enum.flat_map(fn tag ->
      tag = tag |> String.trim() |> String.replace(~r/\s+/u, " ")

      cond do
        String.starts_with?(tag, "#") ->
          ~r/#+([^\s#,]+)/u |> Regex.scan(tag, capture: :all_but_first) |> List.flatten()

        tag == "" ->
          []

        true ->
          [tag]
      end
    end)
    |> Enum.uniq_by(&String.downcase/1)
  end
end
