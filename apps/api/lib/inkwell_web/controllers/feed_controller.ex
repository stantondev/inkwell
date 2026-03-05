defmodule InkwellWeb.FeedController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Bookmarks, Inks, Journals, Redactions, Social, Stamps}
  alias Inkwell.Federation.RemoteEntries
  alias InkwellWeb.EntryController

  # GET /api/feed — authenticated reading feed (friends' + followed remote actors' entries)
  def reading_feed(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    blocked_ids = Social.get_blocked_user_ids(user.id)
    friend_ids = Social.list_friend_ids(user.id) -- blocked_ids

    # Fetch extra from each source to ensure good interleaving after merge
    fetch_count = per_page * 2

    local_entries = Journals.list_feed_entries(user.id, friend_ids, page: 1, per_page: fetch_count, exclude_user_ids: blocked_ids)
    remote_entries = RemoteEntries.list_followed_remote_entries(user.id, page: 1, per_page: fetch_count)

    # Normalize into a common shape and merge chronologically
    local_items = Enum.map(local_entries, fn entry ->
      %{type: :local, entry: entry, published_at: entry.published_at}
    end)

    remote_items = Enum.map(remote_entries, fn re ->
      %{type: :remote, entry: re, published_at: re.published_at}
    end)

    all_items =
      (local_items ++ remote_items)
      |> Enum.sort_by(& &1.published_at, {:desc, DateTime})
      |> Enum.drop((page - 1) * per_page)
      |> Enum.take(per_page)

    # Apply user's redacted words filter
    redacted_words = Redactions.get_redacted_words(user)
    all_items =
      if redacted_words == [], do: all_items,
        else: Enum.reject(all_items, fn item -> Redactions.matches_redaction?(item.entry, redacted_words) end)

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
    series_map = Journals.get_series_for_entries(local_entry_ids)

    # Build stamp/comment maps for remote entries
    remote_entry_ids =
      all_items
      |> Enum.filter(& &1.type == :remote)
      |> Enum.map(& &1.entry.id)

    remote_stamp_types_map = Stamps.get_stamp_types_for_remote_entries(remote_entry_ids)
    remote_my_stamps_map = Stamps.get_user_stamps_for_remote_entries(user.id, remote_entry_ids)
    remote_comment_counts = Journals.count_comments_for_remote_entries(remote_entry_ids)

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
          comment_count: Map.get(comment_counts, entry.id, 0),
          stamps: Map.get(stamp_types_map, entry.id, []),
          my_stamp: Map.get(my_stamps_map, entry.id),
          bookmarked: MapSet.member?(bookmarks_set, entry.id),
          ink_count: entry.ink_count || 0,
          my_ink: MapSet.member?(inks_set, entry.id),
          series: Map.get(series_map, entry.id)
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
          comment_count: Map.get(remote_comment_counts, re.id, 0),
          ink_count: 0,
          my_ink: false,
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
      pagination: %{page: page, per_page: per_page}
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
