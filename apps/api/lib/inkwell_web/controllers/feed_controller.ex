defmodule InkwellWeb.FeedController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Inks, Journals, Redactions, Reprints, Social, Stamps, Timeline, WriterSubscriptions}
  alias Inkwell.Avatars
  alias Inkwell.Federation.{CategoryHashtags, Engagement, RemoteEntries}
  alias InkwellWeb.EntryController

  # GET /api/feed — authenticated reading feed (friends' + followed remote actors' entries)
  def reading_feed(conn, params) do
    user = conn.assigns.current_user
    page = min(parse_int(params["page"], 1), Timeline.max_page())
    per_page = min(parse_int(params["per_page"], 20), 50)
    source_filter = params["source"]
    category_filter = params["category"]
    sort_filter = params["sort"]

    blocked_ids = Social.get_blocked_user_ids(user.id)
    friend_ids = Social.list_friend_ids(user.id) -- blocked_ids
    # People you've asked to follow who haven't accepted: their public
    # entries and reprints are in your Feed already; pen-pals-only waits.
    requested_ids = Social.list_requested_ids(user.id) -- blocked_ids
    followed_ids = friend_ids ++ requested_ids

    subscribed_writer_ids = WriterSubscriptions.get_subscribed_writer_ids(user.id)

    # Build category hashtags for remote entry filtering
    category_hashtags =
      if is_binary(category_filter) && category_filter != "" do
        CategoryHashtags.hashtags_for_category(category_filter)
      else
        nil
      end

    # Muted words are checked per source, before paging, so a hidden entry
    # doesn't leave a short page (the web app reads a short page as the end).
    redacted_words = Redactions.get_redacted_words(user)
    not_redacted = fn item -> not Redactions.matches_redaction?(item.entry, redacted_words) end
    needed = page * per_page

    local_source =
      if source_filter == "fediverse" do
        {[], true}
      else
        circle_ids = Inkwell.Circles.member_circle_ids(user.id)
        hide_stickies = EntryController.hides_stickies?(user)

        Timeline.take(fn offset, limit ->
          Journals.list_feed_entries(user.id, friend_ids,
            offset: offset, per_page: limit, exclude_user_ids: blocked_ids,
            public_ids: requested_ids,
            subscribed_writer_ids: subscribed_writer_ids,
            circle_ids: circle_ids,
            category: category_filter, sort: sort_filter,
            exclude_stickies: hide_stickies)
          |> Enum.map(&%{type: :local, entry: &1, published_at: &1.published_at, ink_count: &1.ink_count || 0})
        end, not_redacted, needed)
      end

    remote_source =
      cond do
        source_filter == "inkwell" -> {[], true}
        is_list(category_hashtags) && category_hashtags == [] -> {[], true}
        true ->
          Timeline.take(fn offset, limit ->
            RemoteEntries.list_followed_remote_entries(user.id,
              offset: offset, per_page: limit, tags: category_hashtags)
            |> Enum.map(&%{type: :remote, entry: &1, published_at: &1.published_at, ink_count: &1.likes_count || 0})
          end, not_redacted, needed)
      end

    # Reprints by people you follow. Reprints of entries by people you follow
    # are left out in the query: the original is already in the feed.
    reprint_source =
      if source_filter == "fediverse" do
        {[], true}
      else
        Timeline.take(fn offset, limit ->
          reprints =
            Reprints.list_feed_reprints(user.id, followed_ids,
              exclude_user_ids: blocked_ids, exclude_author_ids: followed_ids,
              limit: limit, offset: offset)

          entries =
            reprints
            |> Enum.map(& &1.entry_id)
            |> Journals.get_entries_by_ids()
            |> Inkwell.Repo.preload(:user_icon)
            |> Map.new(&{&1.id, &1})

          for r <- reprints, entry = entries[r.entry_id], entry != nil do
            %{type: :reprint, reprint: r, entry: entry, published_at: r.reprinted_at, ink_count: 0}
          end
        end, not_redacted, needed)
      end

    sorter = fn items ->
      if sort_filter == "most_inked" do
        Enum.sort_by(items, fn i -> {i.ink_count, i.published_at} end, fn {a_ink, a_pub}, {b_ink, b_pub} ->
          if a_ink == b_ink, do: DateTime.compare(a_pub, b_pub) != :lt, else: a_ink > b_ink
        end)
      else
        Enum.sort_by(items, & &1.published_at, {:desc, DateTime})
      end
    end

    {all_items, has_more} =
      Timeline.page([local_source, remote_source, reprint_source], sorter, page, per_page)

    # Build stamp/comment maps for local entries
    local_entry_ids =
      all_items
      |> Enum.filter(& &1.type == :local)
      |> Enum.map(& &1.entry.id)

    stamp_types_map = Stamps.get_stamp_types_for_entries(local_entry_ids)
    my_stamps_map = Stamps.get_user_stamps_for_entries(user.id, local_entry_ids)
    comment_counts = Journals.count_comments_for_entries(local_entry_ids)
    bookmarks_set = Bookmarks.get_bookmarks_for_entries(user.id, local_entry_ids)
    inks_set = Inks.get_user_inks_for_entries(user.id, local_entry_ids)
    reprints_set = Reprints.get_user_reprints_for_entries(user.id, local_entry_ids)
    series_map = Journals.get_series_for_entries(local_entry_ids)

    # Build stamp/comment maps for remote entries
    remote_entry_ids =
      all_items
      |> Enum.filter(& &1.type == :remote)
      |> Enum.map(& &1.entry.id)

    remote_stamp_types_map = Stamps.get_stamp_types_for_remote_entries(remote_entry_ids)
    remote_my_stamps_map = Stamps.get_user_stamps_for_remote_entries(user.id, remote_entry_ids)

    # Replies/boosts/favourites from the post's home server + what members did.
    remote_entries = for %{type: :remote, entry: re} <- all_items, do: re
    remote_counts = Engagement.summaries(remote_entries, user.id)
    Engagement.refresh_stale(remote_entries)

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
            avatar_url: Avatars.avatar_url(author),
            avatar_frame: author.avatar_frame,
            avatar_animation: author.avatar_animation,
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
          my_reprint: MapSet.member?(reprints_set, entry.id),
          series: Map.get(series_map, entry.id),
          is_paid: entry.privacy == :paid
        })

      %{type: :reprint, reprint: r, entry: entry} ->
        # The full user row: the reprint query's author map lacks fields
        # rendered below, which made any reprint crash the whole Feed.
        author = entry.user

        entry
        |> EntryController.render_entry()
        |> Map.merge(%{
          source: "reprint",
          reprinter: r.reprinter,
          reprinted_at: r.reprinted_at,
          author: %{
            id: author.id,
            username: author.username,
            display_name: author.display_name,
            avatar_url: Avatars.avatar_url(author),
            avatar_frame: author.avatar_frame,
            avatar_animation: author.avatar_animation,
            subscription_tier: Inkwell.SelfHosted.effective_tier(author),
            ink_donor_status: nil
          },
          comment_count: Map.get(comment_counts, entry.id, 0),
          stamps: Map.get(stamp_types_map, entry.id, []),
          my_stamp: Map.get(my_stamps_map, entry.id),
          bookmarked: MapSet.member?(bookmarks_set, entry.id),
          ink_count: entry.ink_count || 0,
          reprint_count: entry.reprint_count || 0,
          my_ink: MapSet.member?(inks_set, entry.id),
          my_reprint: MapSet.member?(reprints_set, entry.id),
          series: Map.get(series_map, entry.id),
          is_paid: entry.privacy == :paid
        })

      %{type: :remote, entry: re} ->
        actor = re.remote_actor

        profile_url =
          case actor.raw_data do
            %{"url" => url} when is_binary(url) -> url
            _ -> actor.ap_id
          end

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
            profile_url: profile_url
          },
          stamps: Map.get(remote_stamp_types_map, re.id, []),
          my_stamp: Map.get(remote_my_stamps_map, re.id),
          comment_count: remote_counts[re.id].comment_count,
          ink_count: remote_counts[re.id].ink_count,
          boosts_count: remote_counts[re.id].boosts_count,
          my_ink: remote_counts[re.id].my_ink,
          reprint_count: remote_counts[re.id].reprint_count,
          my_reprint: remote_counts[re.id].my_reprint,
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

    data = data |> EntryController.put_sticky_expansions(user.id) |> EntryController.put_circle_labels()

    json(conn, %{
      data: data,
      pagination: %{page: page, per_page: per_page, has_more: has_more}
    })
  end

  # GET /api/explore/feed.xml — global RSS feed of latest public entries
  def explore_feed(conn, _params) do
    entries =
      Journals.list_public_explore_entries(per_page: 20)
      |> Enum.reject(fn e -> e.sensitive || e.admin_sensitive end)

    items =
      entries
      |> Enum.map(fn entry ->
        author = entry.user
        title = entry.title || "Entry by #{author.display_name}"
        pub_date = format_rfc822(entry.published_at)
        link = "#{base_url()}/#{author.username}/#{entry.slug}"
        description = entry.excerpt || ""

        """
        <item>
          <title><![CDATA[#{title}]]></title>
          <link>#{link}</link>
          <guid isPermaLink="true">#{link}</guid>
          <pubDate>#{pub_date}</pubDate>
          <dc:creator><![CDATA[#{author.display_name}]]></dc:creator>
          <description><![CDATA[#{description}]]></description>
        </item>
        """
      end)
      |> Enum.join("\n")

    xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>Inkwell — Latest Entries</title>
        <link>#{base_url()}/explore</link>
        <description>Latest public journal entries on Inkwell</description>
        <atom:link href="#{base_url()}/api/explore/feed.xml" rel="self" type="application/rss+xml"/>
        #{items}
      </channel>
    </rss>
    """

    conn
    |> put_resp_content_type("application/rss+xml")
    |> send_resp(200, xml)
  end

  # GET /api/users/:username/feed.xml — RSS feed for a user's public entries
  def user_feed(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "User not found")

      user ->
        entries =
          Journals.list_public_entries(user.id, per_page: 20)
          |> Enum.reject(fn e -> e.sensitive || e.admin_sensitive end)
        xml = build_rss(user, entries, "#{base_url()}/users/#{username}")

        conn
        |> put_resp_content_type("application/rss+xml")
        |> send_resp(200, xml)
    end
  end

  # GET /api/tags/:tag/feed.xml — RSS feed for a tag
  def tag_feed(conn, %{"tag" => tag}) do
    entries = Journals.list_public_explore_entries(tag: tag, per_page: 20)

    items =
      entries
      |> Enum.map(fn entry ->
        author = entry.user
        title = entry.title || "Entry on ##{tag}"
        pub_date = format_rfc822(entry.published_at)
        link = "#{base_url()}/#{author.username}/#{entry.slug}"
        description = entry.excerpt || entry.body_html || ""

        """
        <item>
          <title><![CDATA[#{title}]]></title>
          <link>#{link}</link>
          <guid isPermaLink="true">#{link}</guid>
          <pubDate>#{pub_date}</pubDate>
          <description><![CDATA[#{description}]]></description>
        </item>
        """
      end)
      |> Enum.join("\n")

    xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>##{tag} — Inkwell</title>
        <link>#{base_url()}/tag/#{tag}</link>
        <description>Entries tagged ##{tag} on Inkwell</description>
        #{items}
      </channel>
    </rss>
    """

    conn
    |> put_resp_content_type("application/rss+xml")
    |> send_resp(200, xml)
  end

  # ── RSS builder ─────────────────────────────────────────────────────────

  defp build_rss(user, entries, feed_url) do
    items =
      entries
      |> Enum.map(fn entry ->
        title = entry.title || "Entry by #{user.display_name}"
        pub_date = entry.published_at |> format_rfc822()
        link = "#{base_url()}/#{user.username}/#{entry.slug}"
        description = entry.excerpt || entry.body_html || ""

        """
        <item>
          <title><![CDATA[#{title}]]></title>
          <link>#{link}</link>
          <guid isPermaLink="true">#{link}</guid>
          <pubDate>#{pub_date}</pubDate>
          <description><![CDATA[#{description}]]></description>
        </item>
        """
      end)
      |> Enum.join("\n")

    """
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
      <channel>
        <title>#{user.display_name} — Inkwell</title>
        <link>#{feed_url}</link>
        <description>Journal entries by #{user.display_name} on Inkwell</description>
        <atom:link href="#{feed_url}/feed.xml" rel="self" type="application/rss+xml"/>
        #{items}
      </channel>
    </rss>
    """
  end

  defp format_rfc822(nil), do: ""
  defp format_rfc822(dt) do
    Calendar.strftime(dt, "%a, %d %b %Y %H:%M:%S +0000")
  end

  defp base_url do
    Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
