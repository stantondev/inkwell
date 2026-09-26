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

    # Only include users who have at least 1 published public entry
    users_with_entries =
      Entry
      |> where([e], e.privacy == :public and e.status == :published)
      |> group_by([e], e.user_id)
      |> select([e], e.user_id)
      |> Repo.all()
      |> MapSet.new()

    users =
      User
      |> where([u], not is_nil(u.username))
      |> where([u], is_nil(u.blocked_at))
      |> where([u], u.id not in subquery(Inkwell.Journals.showcase_excluded_user_ids()))
      |> select([u], %{id: u.id, username: u.username, updated_at: u.updated_at})
      |> Repo.all()
      |> Enum.filter(fn u -> MapSet.member?(users_with_entries, u.id) end)
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
      |> where([e, u], u.id not in subquery(Inkwell.Journals.showcase_excluded_user_ids()))
      |> select([e, u], %{
        username: u.username,
        slug: e.slug,
        updated_at: e.updated_at
      })
      |> Repo.all()
      |> Enum.map(fn e ->
        Map.put(e, :custom_domain, Map.get(username_domain_map, e.username))
      end)

    # Tag and topic pages list only Inkwell entries (fediverse posts sit on a
    # noindex tab), and Explore leaves out suspended and limited writers. Count
    # the same entries here, so the sitemap never lists a page that would open
    # on its noindex fediverse view.
    listed_entries =
      Entry
      |> where([e], e.privacy == :public and e.status == :published)
      |> where([e], e.user_id not in subquery(Inkwell.Journals.hidden_from_discovery_user_ids()))

    # Only include tags used by at least 2 published entries (skip thin tag pages)
    tags =
      listed_entries
      |> where([e], fragment("array_length(?, 1) > 0", e.tags))
      |> select([e], e.tags)
      |> Repo.all()
      |> List.flatten()
      |> Inkwell.Journals.count_tags()
      |> Enum.filter(fn {_tag, count} -> count >= 2 end)
      # Lowercase, matching the tag page's canonical URL.
      |> Enum.map(fn {tag, _count} -> String.downcase(tag) end)

    categories =
      listed_entries
      |> where([e], not is_nil(e.category))
      |> distinct(true)
      |> select([e], e.category)
      |> Repo.all()
      |> Enum.map(&to_string/1)

    json(conn, %{users: users, entries: entries, tags: tags, categories: categories})
  end
end
