defmodule InkwellWeb.ExploreController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Inks, Journals, Redactions, Reprints, Social, Stamps, Timeline, WriterSubscriptions}
  alias Inkwell.Avatars
  alias Inkwell.Federation.{CategoryHashtags, ContentQuality, RemoteEntries}
  alias InkwellWeb.EntryController

  # GET /api/explore — public discovery feed with local + federated entries
  # Optional params: page, per_page, tag, category, sort
  # Optional auth: populates my_stamp/my_ink when logged in
  def index(conn, params) do
    page = min(parse_int(params["page"], 1), Timeline.max_page())
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

    # Fediverse blocks (remote actors + domains)
    fediverse_blocks = if viewer do
      Inkwell.Moderation.FediverseBlocks.get_all_blocks_for_user(viewer.id)
    else
      # Still check admin-level defederation for logged-out users
      admin_domains = Inkwell.Moderation.FediverseBlocks.list_admin_blocked_domains()
      %{blocked_remote_actor_ids: [], blocked_domains: Enum.map(admin_domains, & &1.domain)}
    end

    # Muted words are checked per source, before paging, so a hidden entry
    # doesn't leave a short page (the web app reads a short page as the end).
    redacted_words = if viewer, do: Redactions.get_redacted_words(viewer), else: []
    not_redacted = fn entry -> not Redactions.matches_redaction?(entry, redacted_words) end
    needed = page * per_page

    local_source =
      if source_filter == "fediverse" do
        {[], true}
      else
        hide_stickies = EntryController.hides_stickies?(viewer)
        showcase = params["showcase"] in ["1", "true"]

        Timeline.take(fn offset, limit ->
          Journals.list_public_explore_entries(
            offset: offset, per_page: limit, tag: tag, category: category,
            include_sensitive: include_sensitive, exclude_user_ids: blocked_ids,
            sort: sort, exclude_stickies: hide_stickies, showcase: showcase
          )
          |> Enum.map(&%{type: :local, entry: &1, published_at: &1.published_at, ink_count: &1.ink_count || 0})
        end, &not_redacted.(&1.entry), needed)
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

    remote_source =
      if source_filter == "inkwell" || remote_filter_opts == :skip do
        {[], true}
      else
        blocked_actor_ids = fediverse_blocks.blocked_remote_actor_ids
        blocked_domains = fediverse_blocks.blocked_domains

        # Sensitive, low-quality (mojibake, bots, link-only) and blocked
        # posts are filtered here, per post, before paging.
        keep? = fn %{entry: re} ->
          (include_sensitive or not re.sensitive) and
            ContentQuality.filter_remote_entries([re]) != [] and
            re.remote_actor_id not in blocked_actor_ids and
            not (re.remote_actor && re.remote_actor.domain &&
                   String.downcase(re.remote_actor.domain) in blocked_domains) and
            not_redacted.(re)
        end

        Timeline.take(fn offset, limit ->
          RemoteEntries.list_public_remote_entries([offset: offset, per_page: limit] ++ remote_filter_opts)
          |> Enum.map(&%{type: :remote, entry: &1, published_at: &1.published_at, ink_count: 0})
        end, keep?, needed)
      end

    {all_items, has_more} =
      Timeline.page([local_source, remote_source], &sort_items(&1, sort), page, per_page)

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

    reprints_set =
      if viewer do
        Reprints.get_user_reprints_for_entries(viewer.id, local_entry_ids)
      else
        MapSet.new()
      end

    local_comment_counts = Journals.count_comments_for_entries(local_entry_ids)
    remote_reprints_set =
      if viewer do
        Reprints.get_user_reprints_for_remote_entries(viewer.id, remote_entry_ids)
      else
        MapSet.new()
      end

    remote_reprint_counts = Reprints.count_reprints_for_remote_entries(remote_entry_ids)

    remote_comment_counts = Journals.count_comments_for_remote_entries(remote_entry_ids)
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
              avatar_url: Avatars.avatar_url(author),
              subscription_tier: Inkwell.SelfHosted.effective_tier(author),
              ink_donor_status: author.ink_donor_status
            },
            comment_count: Map.get(local_comment_counts, entry.id, 0),
            stamps: Map.get(stamp_types_map, entry.id, []),
            my_stamp: Map.get(my_stamps_map, entry.id),
            bookmarked: MapSet.member?(bookmarks_set, entry.id),
            ink_count: entry.ink_count || 0,
            reprint_count: entry.reprint_count || 0,
            my_ink: MapSet.member?(inks_set, entry.id),
            my_reprint: MapSet.member?(reprints_set, entry.id),
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
          ink_count: Map.get(remote_ink_counts, re.id, 0) + (re.likes_count || 0),
          reprint_count: Map.get(remote_reprint_counts, re.id, 0) + (re.reprint_count || 0),
          boosts_count: re.boosts_count || 0,
          my_ink: MapSet.member?(remote_inks_set, re.id),
          my_reprint: MapSet.member?(remote_reprints_set, re.id),
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

    data = data |> EntryController.put_sticky_expansions(viewer && viewer.id) |> EntryController.put_circle_labels()

    json(conn, %{
      data: data,
      pagination: %{page: page, per_page: per_page, has_more: has_more, tag: tag, category: category, sort: sort, source: source_filter}
    })
  end

  # GET /api/explore/writers — "Writers to meet" on Explore. Signed out: anyone
  # active and not spam; signed in: also leaves out people you follow.
  def writers(conn, params) do
    viewer = conn.assigns[:current_user]
    limit = params["limit"] |> parse_int(8) |> min(12)

    data =
      Accounts.list_suggested_users(viewer && viewer.id, limit, order: :recent, pad: false)
      |> Enum.map(&InkwellWeb.UserController.render_suggested/1)

    json(conn, %{data: data})
  end

  # GET /api/explore/trending — most-inked entries of the last 30 days.
  # (It was 7 days and 2+ inks, which nothing met: the row never showed.)
  def trending(conn, _params) do
    viewer = conn.assigns[:current_user]
    blocked_ids = if viewer, do: Social.get_blocked_user_ids(viewer.id), else: []

    entries = Inks.list_trending_entries(
      days: 30,
      min_inks: 1,
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

    reprints_set =
      if viewer do
        Reprints.get_user_reprints_for_entries(viewer.id, entry_ids)
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
          avatar_url: Avatars.avatar_url(author),
          subscription_tier: Inkwell.SelfHosted.effective_tier(author),
          ink_donor_status: author.ink_donor_status
        },
        comment_count: Map.get(comment_counts, entry.id, 0),
        stamps: Map.get(stamp_types_map, entry.id, []),
        my_stamp: Map.get(my_stamps_map, entry.id),
        bookmarked: MapSet.member?(bookmarks_set, entry.id),
        ink_count: entry.ink_count || 0,
        reprint_count: entry.reprint_count || 0,
        my_ink: MapSet.member?(inks_set, entry.id),
        my_reprint: MapSet.member?(reprints_set, entry.id)
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
