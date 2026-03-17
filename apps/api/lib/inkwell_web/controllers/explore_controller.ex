defmodule InkwellWeb.ExploreController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Inks, Journals, Redactions, Social, Stamps, WriterSubscriptions}
  alias Inkwell.Federation.{CategoryHashtags, ContentQuality, RemoteEntries}
  alias InkwellWeb.EntryController

  # GET /api/explore — public discovery feed with local + federated entries
  # Optional params: page, per_page, tag, category, sort
  # Optional auth: populates my_stamp/my_ink when logged in
  def index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 20), 50)
    tag = params["tag"]
    category = params["category"]
    sort = params["sort"] || "newest"
    source_filter = params["source"]
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

    local_entries =
      if source_filter == "fediverse" do
        []
      else
        Journals.list_public_explore_entries(
          page: 1, per_page: fetch_count, tag: tag, category: category,
          include_sensitive: include_sensitive, exclude_user_ids: blocked_ids,
          sort: sort
        )
      end

    # Build remote entry filter options based on category/tag
    remote_filter_opts =
      cond do
        category != nil && category != "" ->
          hashtags = CategoryHashtags.hashtags_for_category(category)
          if hashtags == [], do: :skip, else: [tags: hashtags]

        tag != nil && tag != "" ->
          [tag: tag]

        true ->
          []
      end

    remote_entries =
      if source_filter == "inkwell" || remote_filter_opts == :skip do
        []
      else
        filter_opts = if is_list(remote_filter_opts), do: remote_filter_opts, else: []
        all_remote = RemoteEntries.list_public_remote_entries([page: 1, per_page: fetch_count] ++ filter_opts)

        all_remote =
          if include_sensitive do
            all_remote
          else
            Enum.reject(all_remote, fn re -> re.sensitive end)
          end

        # Filter out mojibake, bot content, and low-quality posts at read time
        ContentQuality.filter_remote_entries(all_remote)
      end

    # Normalize into a common shape
    local_items = Enum.map(local_entries, fn entry ->
      %{type: :local, entry: entry, published_at: entry.published_at, ink_count: entry.ink_count || 0}
    end)

    remote_items = Enum.map(remote_entries, fn re ->
      %{type: :remote, entry: re, published_at: re.published_at, ink_count: 0}
    end)

    # Merge and sort based on selected sort mode, then paginate
    all_items =
      (local_items ++ remote_items)
      |> sort_items(sort)
      |> Enum.drop((page - 1) * per_page)
      |> Enum.take(per_page)

    # Apply viewer's redacted words filter
    redacted_words = if viewer, do: Redactions.get_redacted_words(viewer), else: []
    all_items =
      if redacted_words == [], do: all_items,
        else: Enum.reject(all_items, fn item -> Redactions.matches_redaction?(item.entry, redacted_words) end)

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

    inks_set =
      if viewer do
        Inks.get_user_inks_for_entries(viewer.id, local_entry_ids)
      else
        MapSet.new()
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

    remote_ink_counts = Inks.count_inks_for_remote_entries(remote_entry_ids)

    remote_inks_set =
      if viewer do
        Inks.get_user_inks_for_remote_entries(viewer.id, remote_entry_ids)
      else
        MapSet.new()
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

    # Build set of subscribed writer IDs for paywall checks
    subscribed_writer_ids_set =
      if viewer do
        WriterSubscriptions.get_subscribed_writer_ids(viewer.id) |> MapSet.new()
      else
        MapSet.new()
      end

    data = Enum.map(all_items, fn
      %{type: :local, entry: entry} ->
        author = entry.user || Accounts.get_user!(entry.user_id)
        is_paid = entry.privacy == :paid
        is_own = viewer != nil && viewer.id == entry.user_id
        is_subscribed = MapSet.member?(subscribed_writer_ids_set, entry.user_id)
        is_paywalled = is_paid && !is_own && !is_subscribed

        rendered =
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
            ink_count: entry.ink_count || 0,
            my_ink: MapSet.member?(inks_set, entry.id),
            series: Map.get(series_map, entry.id),
            is_paid: is_paid,
            is_paywalled: is_paywalled
          })

        if is_paywalled do
          plan = WriterSubscriptions.get_active_plan_for_writer(entry.user_id)
          rendered
          |> Map.put(:body_html, nil)
          |> Map.put(:writer_plan, if(plan, do: %{
            id: plan.id,
            name: plan.name,
            price_cents: plan.price_cents,
            subscriber_count: plan.subscriber_count
          }, else: nil))
        else
          rendered
        end

      %{type: :remote, entry: re} ->
        actor = re.remote_actor

        %{
          id: re.id,
          source: "remote",
          relay_source: re.source,
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
          comment_count: max(re.reply_count || 0, Map.get(remote_comment_counts, re.id, 0)),
          ink_count: Map.get(remote_ink_counts, re.id, 0),
          my_ink: MapSet.member?(remote_inks_set, re.id),
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
      pagination: %{page: page, per_page: per_page, tag: tag, category: category, sort: sort, source: source_filter}
    })
  end

  # GET /api/explore/trending — top entries by ink count in the last 7 days
  def trending(conn, _params) do
    viewer = conn.assigns[:current_user]
    blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

    entries = Inks.list_trending_entries(
      days: 7,
      min_inks: 2,
      limit: 8,
      exclude_user_ids: blocked_ids
    )

    # Apply viewer's redacted words filter
    redacted_words = if viewer, do: Redactions.get_redacted_words(viewer), else: []
    entries = Redactions.filter_entries(entries, redacted_words)

    entry_ids = Enum.map(entries, & &1.id)
    stamp_types_map = Stamps.get_stamp_types_for_entries(entry_ids)
    comment_counts = Journals.count_comments_for_entries(entry_ids)

    inks_set =
      if viewer do
        Inks.get_user_inks_for_entries(viewer.id, entry_ids)
      else
        MapSet.new()
      end

    bookmarks_set =
      if viewer do
        Bookmarks.get_bookmarks_for_entries(viewer.id, entry_ids)
      else
        MapSet.new()
      end

    my_stamps_map =
      if viewer do
        Stamps.get_user_stamps_for_entries(viewer.id, entry_ids)
      else
        %{}
      end

    data = Enum.map(entries, fn entry ->
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
        comment_count: Map.get(comment_counts, entry.id, 0),
        stamps: Map.get(stamp_types_map, entry.id, []),
        my_stamp: Map.get(my_stamps_map, entry.id),
        bookmarked: MapSet.member?(bookmarks_set, entry.id),
        ink_count: entry.ink_count || 0,
        my_ink: MapSet.member?(inks_set, entry.id)
      })
    end)

    json(conn, %{data: data})
  end

  defp sort_items(items, "most_inked") do
    Enum.sort_by(items, fn item -> {-item.ink_count, item.published_at} end,
      fn {count_a, date_a}, {count_b, date_b} ->
        if count_a == count_b do
          DateTime.compare(date_a, date_b) != :lt
        else
          count_a < count_b
        end
      end)
  end
  defp sort_items(items, _sort) do
    Enum.sort_by(items, & &1.published_at, {:desc, DateTime})
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
