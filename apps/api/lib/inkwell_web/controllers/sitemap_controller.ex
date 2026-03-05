defmodule InkwellWeb.SitemapController do
  use InkwellWeb, :controller

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Journals.Entry
  import Ecto.Query

  # GET /api/sitemap-data — public, returns sitemap data in one call
  def index(conn, _params) do
    users =
      User
      |> where([u], not is_nil(u.username))
      |> where([u], is_nil(u.blocked_at))
      |> select([u], %{username: u.username, updated_at: u.updated_at})
      |> Repo.all()

    entries =
      Entry
      |> where([e], e.privacy == :public and e.status == :published)
      |> where([e], not is_nil(e.published_at))
      |> join(:inner, [e], u in User, on: e.user_id == u.id)
      |> where([e, u], is_nil(u.blocked_at))
      |> select([e, u], %{
        username: u.username,
        slug: e.slug,
        updated_at: e.updated_at
      })
      |> Repo.all()

    tags =
      Entry
      |> where([e], e.privacy == :public and e.status == :published)
      |> where([e], fragment("array_length(?, 1) > 0", e.tags))
      |> select([e], e.tags)
      |> Repo.all()
      |> List.flatten()
      |> Enum.uniq()

    json(conn, %{users: users, entries: entries, tags: tags})
  end
end
