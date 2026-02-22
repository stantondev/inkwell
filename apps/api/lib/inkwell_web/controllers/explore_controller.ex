defmodule InkwellWeb.ExploreController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals}
  alias InkwellWeb.EntryController

  # GET /api/explore — public discovery feed
  # Optional params: page, per_page, tag
  def index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 20), 50)
    tag = params["tag"]

    entries = Journals.list_public_explore_entries(page: page, per_page: per_page, tag: tag)

    json(conn, %{
      data: Enum.map(entries, fn entry ->
        author = entry.user || Accounts.get_user!(entry.user_id)
        comment_count = Journals.count_comments(entry.id)

        entry
        |> EntryController.render_entry()
        |> Map.merge(%{
          author: %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url
          },
          user_icon: entry.user_icon,
          comment_count: comment_count
        })
      end),
      pagination: %{page: page, per_page: per_page, tag: tag}
    })
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
end
