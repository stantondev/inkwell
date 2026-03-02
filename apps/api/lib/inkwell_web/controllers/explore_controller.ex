defmodule InkwellWeb.ExploreController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Journals, Social, Stamps}
  alias Inkwell.Federation.RemoteEntries
  alias InkwellWeb.EntryController

  # GET /api/explore — public discovery feed with local + federated entries
  # Optional params: page, per_page, tag
  # Optional auth: populates my_stamp when logged in
  def index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 20), 50)
    tag = params["tag"]
    category = params["category"]
    viewer = conn.assigns[:current_user]

    # Check if the viewer has opted in to see sensitive content
    include_sensitive =
      case viewer do
        %{settings: %{"show_sensitive_content" => true}} -> true
        _ -> false
      end

    blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

    # Fetch extra from each source to ensure good interleaving after merge
    fetch_count = per_page * 2

    local_entries = Journals.list_public_explore_entries(page: 1, per_page: fetch_count, tag: tag, category: category, include_sensitive: include_sensitive, exclude_user_ids: blocked_ids)
    all_remote = RemoteEntries.list_public_remote_entries(page: 1, per_page: fetch_count)

    # Filter out sensitive remote entries unless viewer has opted in
    remote_entries =
      if include_sensitive do
        all_remote
      else
        Enum.reject(all_remote, fn re -> re.sensitive end)
      end

    # Normalize into a common shape
    local_items = Enum.map(local_entries, fn entry ->
      %{type: :local, entry: entry, published_at: entry.published_at}
    end)

    remote_items = Enum.map(remote_entries, fn re ->
      %{type: :remote, entry: re, published_at: re.published_at}
    end)

    # Merge, sort by published_at DESC, paginate
    all_items =
      (local_items ++ remote_items)
      |> Enum.sort_by(& &1.published_at, {:desc, DateTime})
      |> Enum.drop((page - 1) * per_page)
      |> Enum.take(per_page)

    # Build stamp maps for local entries
    local_entry_ids =
      all_items
      |> Enum.filter(& &1.type == :local)
      |> Enum.map(& &1.entry.id)

    stamp_types_map = Stamps.get_stamp_types_for_entries(local_entry_ids)

    my_stamps_map =
      if viewer do
        Stamps.get_user_stamps_for_entries(viewer.id, local_entry_ids)
      else
        %{}
      end

    # Build stamp maps for remote entries
    remote_entry_ids =
      all_items
      |> Enum.filter(& &1.type == :remote)
      |> Enum.map(& &1.entry.id)

    remote_stamp_types_map = Stamps.get_stamp_types_for_remote_entries(remote_entry_ids)

    remote_my_stamps_map =
      if viewer do
        Stamps.get_user_stamps_for_remote_entries(viewer.id, remote_entry_ids)
      else
        %{}
      end

    remote_comment_counts = Journals.count_comments_for_remote_entries(remote_entry_ids)
    local_comment_counts = Journals.count_comments_for_entries(local_entry_ids)
    series_map = Journals.get_series_for_entries(local_entry_ids)

    bookmarks_set =
      if viewer do
        Bookmarks.get_bookmarks_for_entries(viewer.id, local_entry_ids)
      else
        MapSet.new()
      end

    data = Enum.map(all_items, fn
      %{type: :local, entry: entry} ->
        author = entry.user || Accounts.get_user!(entry.user_id)

        entry
        |> EntryController.render_entry()
        |> Map.merge(%{
          source: "local",
          author: %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url,
            subscription_tier: author.subscription_tier,
            ink_donor_status: author.ink_donor_status
          },
          user_icon: entry.user_icon,
          comment_count: Map.get(local_comment_counts, entry.id, 0),
          stamps: Map.get(stamp_types_map, entry.id, []),
          my_stamp: Map.get(my_stamps_map, entry.id),
          bookmarked: MapSet.member?(bookmarks_set, entry.id),
          series: Map.get(series_map, entry.id)
        })

      %{type: :remote, entry: re} ->
        actor = re.remote_actor

        %{
          id: re.id,
          source: "remote",
          ap_id: re.ap_id,
          url: re.url,
          title: re.title,
          body_html: re.body_html,
          tags: re.tags || [],
          published_at: re.published_at,
          author: %{
            username: actor.username,
            display_name: actor.display_name || actor.username,
            avatar_url: actor.avatar_url,
            domain: actor.domain,
            ap_id: actor.ap_id,
            profile_url: get_profile_url(actor)
          },
          stamps: Map.get(remote_stamp_types_map, re.id, []),
          my_stamp: Map.get(remote_my_stamps_map, re.id),
          comment_count: Map.get(remote_comment_counts, re.id, 0),
          sensitive: re.sensitive || false,
          content_warning: re.content_warning,
          is_sensitive: re.sensitive || false,
          mood: nil,
          music: nil,
          slug: nil,
          privacy: "public",
          status: "published"
        }
    end)

    json(conn, %{
      data: data,
      pagination: %{page: page, per_page: per_page, tag: tag, category: category}
    })
  end

  defp get_profile_url(actor) do
    case actor.raw_data do
      %{"url" => url} when is_binary(url) -> url
      _ -> actor.ap_id
    end
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
end
