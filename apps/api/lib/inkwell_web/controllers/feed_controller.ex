defmodule InkwellWeb.FeedController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Journals, Social, Stamps}
  alias InkwellWeb.EntryController

  # GET /api/feed — authenticated reading feed (friends' entries, chronological)
  def reading_feed(conn, params) do
    user = conn.assigns.current_user
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    friend_ids = Social.list_friend_ids(user.id)

    entries = Journals.list_feed_entries(user.id, friend_ids, page: page, per_page: per_page)

    entry_ids = Enum.map(entries, & &1.id)
    stamp_types_map = Stamps.get_stamp_types_for_entries(entry_ids)
    my_stamps_map = Stamps.get_user_stamps_for_entries(user.id, entry_ids)

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
          comment_count: comment_count,
          stamps: Map.get(stamp_types_map, entry.id, []),
          my_stamp: Map.get(my_stamps_map, entry.id)
        })
      end),
      pagination: %{page: page, per_page: per_page}
    })
  end

  # GET /api/users/:username/feed.xml — RSS feed for a user's public entries
  def user_feed(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> send_resp(404, "User not found")

      user ->
        entries = Journals.list_public_entries(user.id, per_page: 20)
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

        """
        <item>
          <title><![CDATA[#{title}]]></title>
          <link>#{link}</link>
          <guid isPermaLink="true">#{link}</guid>
          <pubDate>#{pub_date}</pubDate>
          <description><![CDATA[#{entry.body_html}]]></description>
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

        """
        <item>
          <title><![CDATA[#{title}]]></title>
          <link>#{link}</link>
          <guid isPermaLink="true">#{link}</guid>
          <pubDate>#{pub_date}</pubDate>
          <description><![CDATA[#{entry.body_html}]]></description>
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
