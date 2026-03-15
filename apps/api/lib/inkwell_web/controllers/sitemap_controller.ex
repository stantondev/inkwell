defmodule InkwellWeb.SitemapController do
  use InkwellWeb, :controller

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.CustomDomains.CustomDomain
  alias Inkwell.Journals.Entry
  import Ecto.Query

  # GET /api/sitemap-data — public, returns sitemap data in one call
  def index(conn, _params) do
    # Build a map of user_id → active custom domain
    custom_domain_map =
      CustomDomain
      |> where([cd], cd.status == "active")
      |> select([cd], {cd.user_id, cd.domain})
      |> Repo.all()
      |> Map.new()

    users =
      User
      |> where([u], not is_nil(u.username))
      |> where([u], is_nil(u.blocked_at))
      |> select([u], %{id: u.id, username: u.username, updated_at: u.updated_at})
      |> Repo.all()
      |> Enum.map(fn u ->
        %{username: u.username, updated_at: u.updated_at, custom_domain: Map.get(custom_domain_map, u.id)}
      end)

    # Build username → custom_domain lookup for entries
    username_domain_map = Map.new(users, fn u -> {u.username, u[:custom_domain]} end)

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
      |> Enum.map(fn e ->
        Map.put(e, :custom_domain, Map.get(username_domain_map, e.username))
      end)

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
