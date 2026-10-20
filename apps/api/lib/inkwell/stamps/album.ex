defmodule Inkwell.Stamps.Album do
  @moduledoc """
  The stamp album: how a writer has mounted the stamps readers sent them.

  Stored on `users.stamp_album`:

      %{"version" => 1, "cover" => "oxblood",
        "pages" => [%{"id" => "p1", "title" => "Autumn", "paper" => "cream",
                      "slots" => [stamp_id | nil, ...16]}]}

  Pages are stockbook pages: four glassine strips of four spaces. A stamp is
  mounted at most once; stamps that aren't anywhere are "new arrivals"
  (shown in an envelope until the writer mounts them). A writer who has
  never arranged anything has no stored album, and the web app lays every
  stamp out by date.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts.User

  @slots 16
  @max_pages 100
  @papers ~w(cream black kraft)
  @covers ~w(oxblood forest navy ink)
  @title_max 60

  def slots, do: @slots
  def papers, do: @papers
  def covers, do: @covers

  @doc """
  Cleans an album sent by a client (or read from the database) against the
  stamp ids the writer actually has: unknown or repeated stamps are dropped,
  every page has exactly #{@slots} spaces, titles are short plain text.
  """
  def normalize(album, owned_ids) when is_map(album) do
    owned = MapSet.new(owned_ids)

    {pages, _seen, _ids} =
      album
      |> Map.get("pages")
      |> List.wrap()
      |> Enum.filter(&is_map/1)
      |> Enum.take(@max_pages)
      |> Enum.reduce({[], MapSet.new(), MapSet.new()}, fn page, {acc, seen, ids} ->
        {slots, seen} = clean_slots(page["slots"], owned, seen)
        id = page_id(page["id"], ids, length(acc))

        page = %{
          "id" => id,
          "title" => clean_title(page["title"]),
          "paper" => pick(page["paper"], @papers),
          "slots" => slots
        }

        {[page | acc], seen, MapSet.put(ids, id)}
      end)

    pages = Enum.reverse(pages)
    pages = if pages == [], do: [blank_page("p1")], else: pages

    %{"version" => 1, "cover" => pick(album["cover"], @covers), "pages" => pages}
  end

  def normalize(_, owned_ids), do: normalize(%{}, owned_ids)

  defp clean_slots(slots, owned, seen) do
    list = if is_list(slots), do: Enum.take(slots, @slots), else: []
    list = list ++ List.duplicate(nil, @slots - length(list))

    Enum.map_reduce(list, seen, fn
      id, seen when is_binary(id) ->
        if MapSet.member?(owned, id) and not MapSet.member?(seen, id),
          do: {id, MapSet.put(seen, id)},
          else: {nil, seen}

      _, seen ->
        {nil, seen}
    end)
  end

  defp page_id(id, taken, index) do
    if is_binary(id) and id =~ ~r/^[a-z0-9][a-z0-9_-]{0,39}$/ and not MapSet.member?(taken, id),
      do: id,
      else: unique_id(taken, index + 1)
  end

  defp unique_id(taken, n) do
    id = "p#{n}"
    if MapSet.member?(taken, id), do: unique_id(taken, n + 1), else: id
  end

  defp clean_title(t) when is_binary(t) do
    t
    |> String.replace(~r/<[^>]*>/u, "")
    |> String.replace(~r/[\x00-\x1F\x7F<>]/u, " ")
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
    |> String.slice(0, @title_max)
  end

  defp clean_title(_), do: ""

  defp pick(v, allowed), do: if(v in allowed, do: v, else: hd(allowed))

  defp blank_page(id), do: %{"id" => id, "title" => "", "paper" => "cream", "slots" => List.duplicate(nil, @slots)}

  @doc "The writer's album, cleaned against the stamps they have now, or nil if they've never arranged it."
  def for_user(%User{stamp_album: nil}, _owned_ids), do: nil
  def for_user(%User{stamp_album: album}, owned_ids), do: normalize(album, owned_ids)

  @doc "Saves an album (already normalized)."
  def save(%User{id: id}, album) do
    from(u in User, where: u.id == ^id) |> Repo.update_all(set: [stamp_album: album])
    {:ok, album}
  end
end
